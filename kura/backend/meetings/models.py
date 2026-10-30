import uuid
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class AccessToken(models.Model):
    digest = models.CharField(max_length=64, primary_key=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    expires = models.DateTimeField()


class Meeting(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    client_id = models.UUIDField(default=uuid.uuid4)
    title = models.CharField(max_length=200, default="Untitled conversation")
    source = models.CharField(max_length=12, default="upload")
    upload_kind = models.CharField(max_length=12, default="file")
    meet_url = models.URLField(blank=True)
    status = models.CharField(max_length=24, default="uploading", db_index=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    heartbeat = models.DateTimeField(null=True)
    stop_requested = models.BooleanField(default=False)
    expected_chunks = models.PositiveIntegerField(null=True)
    transcript = models.TextField(blank=True)
    segments = models.JSONField(default=list)
    notes = models.JSONField(default=dict)
    audio_key = models.CharField(max_length=250, blank=True)
    duration = models.FloatField(default=0)
    error = models.CharField(max_length=250, blank=True)
    attempts = models.PositiveIntegerField(default=0)
    available_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "client_id"], name="unique_client_recording"
            ),
            models.UniqueConstraint(
                fields=["source"],
                condition=models.Q(
                    source="meet",
                    status__in=["queued", "joining", "waiting", "recording"],
                ),
                name="single_active_meet_bot",
            ),
        ]


class Chunk(models.Model):
    meeting = models.ForeignKey(
        Meeting, on_delete=models.CASCADE, related_name="chunks"
    )
    seq = models.PositiveIntegerField()
    key = models.CharField(max_length=250)
    sha256 = models.CharField(max_length=64)
    size = models.PositiveIntegerField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["meeting", "seq"], name="unique_chunk_sequence"
            )
        ]
