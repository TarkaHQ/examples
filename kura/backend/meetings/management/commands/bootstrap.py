import os
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    def handle(self, *args, **options):
        email = os.getenv("KURA_ADMIN_EMAIL", "").strip().lower()
        password = os.getenv("KURA_ADMIN_PASSWORD", "")
        if User.objects.exists():
            return
        if not email or len(password) < 16:
            raise CommandError(
                "Set KURA_ADMIN_EMAIL and a KURA_ADMIN_PASSWORD of at least 16 characters."
            )
        User.objects.create_superuser(username=email, email=email, password=password)
        self.stdout.write("Initial Kura owner created.")
