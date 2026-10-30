import re
from urllib.parse import urlsplit
from rest_framework import serializers
from .models import Meeting


def normalize_meet(value):
    p = urlsplit(value)
    m = re.fullmatch(r"/(?:meet/)?([a-z]{3}-[a-z]{4}-[a-z]{3})/?", p.path)
    if p.scheme != "https" or p.netloc != "meet.google.com" or not m:
        raise serializers.ValidationError("Enter a Google Meet HTTPS meeting link.")
    return "https://meet.google.com/" + m[1]


class CreateMeeting(serializers.Serializer):
    client_id = serializers.UUIDField()
    title = serializers.CharField(max_length=200)
    source = serializers.ChoiceField(choices=["upload", "phone", "meet"])
    upload_kind = serializers.ChoiceField(choices=["file", "segments"], default="file")
    meet_url = serializers.CharField(required=False, default="")

    def validate(self, data):
        if data["source"] == "meet":
            data["meet_url"] = normalize_meet(data["meet_url"])
            data["upload_kind"] = "segments"
        return data


class MeetingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Meeting
        fields = [
            "id",
            "client_id",
            "title",
            "source",
            "upload_kind",
            "meet_url",
            "status",
            "created_at",
            "transcript",
            "segments",
            "notes",
            "duration",
            "error",
            "expected_chunks",
        ]
