"""Units shared by every running-cost figure (Running Cost Calculator,
Profitability, EMI Tracking, Truck Maintenance → Full Status, Compliance →
Cost Breakdown), so per-day, per-month and per-km always mean the same thing.

    WORKING_DAYS_PER_MONTH  — the app's 26 working days in a month
    DAYS_PER_MONTH          — calendar days in an average month (365.25 / 12)

A "per day" cost is per WORKING day (monthly ÷ 26). Per km then is:
    Basic    — per day ÷ km/day (Admin → Truck Run Configuration)
    Advanced — per day × 26 ÷ Monthly Distance Average  (= monthly ÷ km/month)
"""

WORKING_DAYS_PER_MONTH = 26
DAYS_PER_MONTH = 365.25 / 12


def per_working_day_from_calendar(per_calendar_day: float) -> float:
    """A cost spread over calendar days, restated per working day."""
    return per_calendar_day * DAYS_PER_MONTH / WORKING_DAYS_PER_MONTH


def per_km_advanced(per_working_day: float | None, monthly_km: float | None) -> float | None:
    """Advanced per-km: the month's cost ÷ the month's km."""
    if not per_working_day or not monthly_km or monthly_km <= 0:
        return None
    return per_working_day * WORKING_DAYS_PER_MONTH / monthly_km
