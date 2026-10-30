import hashlib, secrets
from datetime import timedelta
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed
from .models import AccessToken


class BearerAuthentication(BaseAuthentication):
    def authenticate_header(self, request):
        return "Bearer"

    def authenticate(self, request):
        parts = get_authorization_header(request).split()
        if not parts:
            return None
        if len(parts) != 2 or parts[0].lower() != b"bearer":
            raise AuthenticationFailed("Invalid session.")
        digest = hashlib.sha256(parts[1]).hexdigest()
        token = (
            AccessToken.objects.select_related("user")
            .filter(digest=digest, expires__gt=timezone.now(), user__is_active=True)
            .first()
        )
        if not token:
            raise AuthenticationFailed("Please sign in again.")
        return token.user, token


def issue(user):
    value = secrets.token_urlsafe(32)
    AccessToken.objects.create(
        digest=hashlib.sha256(value.encode()).hexdigest(),
        user=user,
        expires=timezone.now() + timedelta(days=7),
    )
    return value
