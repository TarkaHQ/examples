import hashlib, secrets
from django.conf import settings
from django.contrib.auth import authenticate
from django.core import signing
from django.db import transaction, IntegrityError
from django.db.models import Sum
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.exceptions import ValidationError, PermissionDenied
from . import auth, storage
from .models import Meeting, Chunk
from .serializers import CreateMeeting, MeetingSerializer


class LoginThrottle(AnonRateThrottle):
    scope = "login"


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def login(request):
    user = authenticate(
        username=str(request.data.get("email", "")).lower(),
        password=request.data.get("password", ""),
    )
    if not user:
        return Response({"detail": "Email or password is incorrect."}, status=401)
    return Response({"token": auth.issue(user), "email": user.username})


@api_view(["POST"])
def logout(request):
    request.auth.delete()
    return Response({"ok": True})


@api_view(["GET", "POST"])
def meetings(request):
    if request.method == "GET":
        return Response(
            MeetingSerializer(
                Meeting.objects.filter(owner=request.user)
                .exclude(status="deleting")
                .order_by("-created_at"),
                many=True,
            ).data
        )
    form = CreateMeeting(data=request.data)
    form.is_valid(raise_exception=True)
    data = form.validated_data
    with transaction.atomic():
        # Lock owner to serialize simultaneous client creates and bot admission.
        type(request.user).objects.select_for_update().get(pk=request.user.pk)
        existing = Meeting.objects.filter(
            owner=request.user, client_id=data["client_id"]
        ).first()
        if existing:
            return Response(MeetingSerializer(existing).data)
        if (
            data["source"] == "meet"
            and Meeting.objects.filter(
                status__in=["queued", "joining", "waiting", "recording"]
            ).exists()
        ):
            return Response(
                {
                    "detail": "A Meet bot is already active. Try again after it finishes."
                },
                status=409,
            )
        try:
            with transaction.atomic():
                m = Meeting.objects.create(
                    owner=request.user,
                    status="queued" if data["source"] == "meet" else "uploading",
                    **data,
                )
        except IntegrityError:
            return Response({"detail": "A Meet bot is already active."}, status=409)
    return Response(MeetingSerializer(m).data, status=201)


def owned(request, id):
    return get_object_or_404(Meeting, pk=id, owner=request.user)


@api_view(["GET", "DELETE", "PATCH"])
def meeting(request, id):
    m = owned(request, id)
    if request.method == "DELETE":
        m.stop_requested = True
        m.status = "deleting"
        m.save(update_fields=["stop_requested", "status", "updated_at"])
        return Response({"ok": True}, status=202)
    if request.method == "PATCH":
        if (
            not isinstance(request.data.get("title"), str)
            or not 0 < len(request.data["title"].strip()) <= 200
        ):
            raise ValidationError("Supply a title up to 200 characters.")
        m.title = request.data["title"].strip()
        m.save(update_fields=["title", "updated_at"])
    out = MeetingSerializer(m).data
    out["uploaded_chunks"] = list(
        m.chunks.order_by("seq").values_list("seq", flat=True)
    )
    if m.audio_key:
        ticket = signing.dumps(
            {"id": str(m.id), "owner": m.owner_id}, salt="kura-audio"
        )
        out["audio_url"] = request.build_absolute_uri(f"/api/audio/{ticket}")
    return Response(out)


def save_chunk(m, seq, body):
    if not body or len(body) > 4 * 1024 * 1024 or seq >= settings.MAX_CHUNKS:
        raise ValidationError("Invalid audio chunk size or sequence.")
    digest = hashlib.sha256(body).hexdigest()
    with transaction.atomic():
        m = Meeting.objects.select_for_update().get(pk=m.pk)
        existing = m.chunks.filter(seq=seq).first()
        if existing:
            if existing.sha256 != digest:
                raise ValidationError(
                    "This chunk already exists with different content."
                )
            return
        if m.status not in ["uploading", "recording"]:
            raise ValidationError("This recording no longer accepts audio.")
        total = m.chunks.aggregate(n=Sum("size"))["n"] or 0
        if total + len(body) > settings.MAX_RECORDING_BYTES:
            raise ValidationError("Recording exceeds the 512 MiB limit.")
        key = f"{m.id}/chunks/{seq:06d}"
        storage.put(key, body)
        Chunk.objects.create(meeting=m, seq=seq, key=key, sha256=digest, size=len(body))


def finalize(m, count):
    try:
        count = int(count)
    except (ValueError, TypeError):
        raise ValidationError("Supply the number of audio chunks.")
    if not 1 <= count <= settings.MAX_CHUNKS:
        raise ValidationError("Invalid chunk count.")
    with transaction.atomic():
        m = Meeting.objects.select_for_update().get(pk=m.pk)
        if (
            m.status in ["pending", "processing", "ready"]
            and m.expected_chunks == count
        ):
            return
        if m.status not in ["uploading", "recording"]:
            raise ValidationError("Cannot finalize this meeting.")
        if list(m.chunks.order_by("seq").values_list("seq", flat=True)) != list(
            range(count)
        ):
            raise ValidationError("Some audio chunks are missing.")
        m.expected_chunks = count
        m.status = "pending"
        m.error = ""
        m.save()


@api_view(["PUT"])
def chunk(request, id, seq):
    save_chunk(owned(request, id), seq, request.body)
    return Response({"ok": True})


@api_view(["POST"])
def finish(request, id):
    finalize(owned(request, id), request.data.get("chunks"))
    return Response({"ok": True})


@api_view(["POST"])
def stop(request, id):
    m = owned(request, id)
    m.stop_requested = True
    m.save(update_fields=["stop_requested"])
    return Response({"ok": True})


@api_view(["POST"])
def retry(request, id):
    m = owned(request, id)
    if m.status != "failed" or not m.expected_chunks:
        raise ValidationError("Only a failed processing job can be retried.")
    m.status = "pending"
    m.attempts = 0
    m.available_at = timezone.now()
    m.error = ""
    m.save()
    return Response({"ok": True})


@api_view(["GET"])
def export(request, id):
    m = owned(request, id)
    text = (
        f"# {m.title}\n\n{m.notes.get('summary', '')}\n\n## Decisions\n"
        + "".join(f"- {d}\n" for d in m.notes.get("decisions", []))
        + "\n## Action items\n"
        + "".join(f"- {a['task']}\n" for a in m.notes.get("action_items", []))
        + "\n## Transcript\n\n"
        + m.transcript
    )
    return HttpResponse(
        text,
        content_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="kura-notes.md"'},
    )


def audio(request, ticket):
    try:
        data = signing.loads(ticket, salt="kura-audio", max_age=300)
    except signing.BadSignature:
        return HttpResponse(status=403)
    m = get_object_or_404(Meeting, pk=data["id"], owner_id=data["owner"])
    if not m.audio_key or m.status == "deleting":
        return HttpResponse(status=404)
    if settings.S3_BUCKET:
        from django.shortcuts import redirect

        return redirect(
            storage.client().generate_presigned_url(
                "get_object",
                Params={"Bucket": settings.S3_BUCKET, "Key": m.audio_key},
                ExpiresIn=120,
            )
        )
    return FileResponse(storage.local(m.audio_key).open("rb"), content_type="audio/mp4")


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def internal(request, action, id=None, seq=None):
    expected = settings.KURA_BOT_TOKEN
    if not expected or not secrets.compare_digest(
        request.headers.get("Authorization", ""), f"Bearer {expected}"
    ):
        raise PermissionDenied()
    if action == "claim":
        with transaction.atomic():
            m = (
                Meeting.objects.select_for_update(skip_locked=True)
                .filter(status="queued")
                .order_by("created_at")
                .first()
            )
            if not m:
                return Response({})
            if m.stop_requested:
                m.status = "failed"
                m.error = "Cancelled before joining."
                m.save()
                return Response({})
            m.status = "joining"
            m.heartbeat = timezone.now()
            m.save()
            return Response({"id": str(m.id), "meet_url": m.meet_url})
    m = get_object_or_404(Meeting, pk=id)
    if action == "heartbeat":
        m.heartbeat = timezone.now()
        m.save(update_fields=["heartbeat"])
        return Response(
            {
                "stop": m.stop_requested or m.status == "deleting",
                "delete": m.status == "deleting",
            }
        )
    if action == "chunks":
        save_chunk(m, seq, request.body)
    elif action == "finish":
        finalize(m, request.data.get("chunks"))
    elif action == "state":
        status = request.data.get("status")
        # Terminal processing and deletion states cannot be overwritten by late callbacks.
        if m.status in ["queued", "joining", "waiting", "recording"] and status in [
            "joining",
            "waiting",
            "recording",
            "failed",
        ]:
            m.status = status
            m.error = str(request.data.get("error", ""))[:250]
            m.heartbeat = timezone.now()
            m.save()
    else:
        raise ValidationError("Unknown operation.")
    return Response({"ok": True})


def health(request):
    from django.db import connection

    with connection.cursor() as c:
        c.execute("SELECT 1")
    return HttpResponse('{"status":"ok"}', content_type="application/json")
