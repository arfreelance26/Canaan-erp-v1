import pandas as pd

# Define columns for Fleet
fleet_columns = [
    "Truck ID (e.g. CGI-T001)",
    "Branch Registered To",
    "Registration Number",
    "Manufacturer",
    "Model Name",
    "Truck Type (20 FT RIGID / 20 FT ARTICULATED / 40 FT RIGID / 40 FT ARTICULATED)",
    "Chassis Number",
    "Year of Manufacture",
    "Tyre Layout (e.g. 6+1, 10+1)",
    "Fuel Capacity",
    "Odometer During Purchase",
    "Current Odometer",
    "RC Date (YYYY-MM-DD)",
    "RC Validity Date (YYYY-MM-DD)",
    "RC Expenses",
    "FC Date (YYYY-MM-DD)",
    "FC Expiry Date (YYYY-MM-DD)",
    "FC Expenses",
    "Road Tax Date (YYYY-MM-DD)",
    "Road Tax Number",
    "Road Tax Expenses",
    "Insurance Expiry Date (YYYY-MM-DD)",
    "Insurance Expenses",
    "National Permit Number",
    "National Permit Date (YYYY-MM-DD)",
    "National Permit Expenses",
    "Local Permit Number",
    "Local Permit Date (YYYY-MM-DD)",
    "Local Permit Expenses",
    "Pollution Certificate Number",
    "Pollution Certificate Date (YYYY-MM-DD)",
    "Pollution Certificate Expenses"
]

# Define columns for EMI
emi_columns = [
    "EMI Name / Title",
    "Truck Registration Number",
    "Loan Number",
    "Bank Name",
    "Loan Amount",
    "EMI Start Date (YYYY-MM-DD)",
    "EMI End Date (YYYY-MM-DD)",
    "EMI Amount",
    "Tenure (Months)",
    "EMI Payment Date (YYYY-MM-DD)"
]

# Create DataFrames with empty rows just to show structure
df_fleet = pd.DataFrame(columns=fleet_columns)
df_emi = pd.DataFrame(columns=emi_columns)

# Save to separate Excel files
df_fleet.to_excel("Fleet_Data_Template.xlsx", index=False)
df_emi.to_excel("EMI_Data_Template.xlsx", index=False)

print("Separate Excel templates created successfully!")
