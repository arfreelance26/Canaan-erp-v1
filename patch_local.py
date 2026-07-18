import os

def replace_in_file(filepath, old_str, new_str):
    if not os.path.exists(filepath): return
    with open(filepath, 'r') as f:
        content = f.read()
    if old_str in content:
        content = content.replace(old_str, new_str)
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {filepath}")

# Backend updates
replace_in_file("backend/models.py", 
                'Enum("LOCAL", "LOCAL CFS", "OUTSTATION", "SHIFTING")',
                'Enum("LOCAL WITHOUT CFS", "LOCAL CFS", "OUTSTATION", "SHIFTING")')

replace_in_file("backend/schemas.py", 
                'Literal["LOCAL", "LOCAL CFS", "OUTSTATION", "SHIFTING"]',
                'Literal["LOCAL WITHOUT CFS", "LOCAL CFS", "OUTSTATION", "SHIFTING"]')

replace_in_file("backend/seed_trips.py", 'trip_category="LOCAL"', 'trip_category="LOCAL WITHOUT CFS"')
replace_in_file("backend/seed.py", 'trip_category="LOCAL"', 'trip_category="LOCAL WITHOUT CFS"')

# Frontend updates
replace_in_file("frontend/src/types/trip.ts", 
                '"LOCAL" | "LOCAL CFS" | "OUTSTATION" | "SHIFTING"',
                '"LOCAL WITHOUT CFS" | "LOCAL CFS" | "OUTSTATION" | "SHIFTING"')

replace_in_file("frontend/src/lib/trip-data.ts", 
                '["LOCAL", "LOCAL CFS", "OUTSTATION", "SHIFTING"]',
                '["LOCAL WITHOUT CFS", "LOCAL CFS", "OUTSTATION", "SHIFTING"]')

replace_in_file("frontend/src/lib/trip-data.ts", 'tripCategory: "LOCAL"', 'tripCategory: "LOCAL WITHOUT CFS"')
