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
                'Enum("LOCAL WITHOUT CFS", "LOCAL CFS", "OUTSTATION", "SHIFTING")',
                'Enum("LOCAL", "LOCAL CFS", "OUTSTATION", "SHIFTING")')

replace_in_file("backend/schemas.py", 
                'Literal["LOCAL WITHOUT CFS", "LOCAL CFS", "OUTSTATION", "SHIFTING"]',
                'Literal["LOCAL", "LOCAL CFS", "OUTSTATION", "SHIFTING"]')

replace_in_file("backend/seed_trips.py", 'trip_category="LOCAL WITHOUT CFS"', 'trip_category="LOCAL"')
replace_in_file("backend/seed.py", 'trip_category="LOCAL WITHOUT CFS"', 'trip_category="LOCAL"')

# Frontend updates
replace_in_file("frontend/src/types/trip.ts", 
                '"LOCAL WITHOUT CFS" | "LOCAL CFS" | "OUTSTATION" | "SHIFTING"',
                '"LOCAL" | "LOCAL CFS" | "OUTSTATION" | "SHIFTING"')

replace_in_file("frontend/src/lib/trip-data.ts", 
                '["LOCAL WITHOUT CFS", "LOCAL CFS", "OUTSTATION", "SHIFTING"]',
                '["LOCAL", "LOCAL CFS", "OUTSTATION", "SHIFTING"]')

replace_in_file("frontend/src/lib/trip-data.ts", 'tripCategory: "LOCAL WITHOUT CFS"', 'tripCategory: "LOCAL"')
