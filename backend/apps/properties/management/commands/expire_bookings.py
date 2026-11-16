"""Release unpaid booking holds and close finished stays.

The API also does this whenever bookings are read, but run it every few minutes
(cron / Windows Task Scheduler) so held dates and beds free up even when nobody is browsing:

    python manage.py expire_bookings
"""

from django.core.management.base import BaseCommand

from apps.properties import services


class Command(BaseCommand):
    help = "Cancel bookings whose payment window closed and complete finished stays."

    def handle(self, *args, **options):
        services.expire_stale_bookings()
        services.complete_finished_stays()
        self.stdout.write(self.style.SUCCESS("Booking holds checked."))
