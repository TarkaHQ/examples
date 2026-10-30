import time
from django.core.management.base import BaseCommand
from django.db import close_old_connections
from meetings.pipeline import tick


class Command(BaseCommand):
    def handle(self, *args, **options):
        while True:
            try:
                close_old_connections()
                if not tick():
                    time.sleep(3)
            except Exception as exc:
                self.stderr.write(
                    f"Worker dependency unavailable: {type(exc).__name__}"
                )
                time.sleep(5)
