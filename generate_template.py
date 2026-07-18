import pandas as pd
from openpyxl.worksheet.datavalidation import DataValidation

positions = [
    "Axle 1 - Left", "Axle 1 - Right", "Axle 2 - Left 1", "Axle 2 - Left 2", 
    "Axle 2 - Right 1", "Axle 2 - Right 2", "Spare", "Axle 3 - Left 1", 
    "Axle 3 - Left 2", "Axle 3 - Right 1", "Axle 3 - Right 2", "Axle 2 - Left", 
    "Axle 2 - Right", "Axle 4 - Left 1", "Axle 4 - Left 2", "Axle 4 - Right 1", 
    "Axle 4 - Right 2", "Axle 3 - Left", "Axle 3 - Right", "Axle 5 - Left 1", 
    "Axle 5 - Left 2", "Axle 5 - Right 1", "Axle 5 - Right 2", 
    "Tractor Head - Axle 1 - Left", "Tractor Head - Axle 1 - Right", 
    "Tractor Head - Axle 2 - Left 1", "Tractor Head - Axle 2 - Left 2", 
    "Tractor Head - Axle 2 - Right 1", "Tractor Head - Axle 2 - Right 2", 
    "Trailer - Axle 1 - Left 1", "Trailer - Axle 1 - Left 2", 
    "Trailer - Axle 1 - Right 1", "Trailer - Axle 1 - Right 2", 
    "Trailer - Axle 2 - Left 1", "Trailer - Axle 2 - Left 2", 
    "Trailer - Axle 2 - Right 1", "Trailer - Axle 2 - Right 2", 
    "Trailer - Axle 3 - Left 1", "Trailer - Axle 3 - Left 2", 
    "Trailer - Axle 3 - Right 1", "Trailer - Axle 3 - Right 2", 
    "Tractor Head - Axle 3 - Left 1", "Tractor Head - Axle 3 - Left 2", 
    "Tractor Head - Axle 3 - Right 1", "Tractor Head - Axle 3 - Right 2"
]
positions.sort()

inventory_columns = [
    "Tyre Number (Required)",
    "Brand",
    "Tyre Type",
    "Size",
    "Condition (New / Rethreaded)",
    "Purchase Date (DD-MM-YYYY)",
    "Cost",
    "Expected Range (km)",
    "Repair Cost",
    "Retread Cost",
    "Retread Count"
]

fitment_columns = [
    "Tyre Number (Required)",
    "Truck ID / Registration Number (Required)",
    "Position (Select from Dropdown)",
    "Fitted Date (DD-MM-YYYY)",
    "Fitted Odometer (km)",
    "Removed Date (DD-MM-YYYY) (Leave blank if currently fitted)",
    "Removed Odometer (km) (Leave blank if currently fitted)"
]

df_inventory = pd.DataFrame(columns=inventory_columns)
df_fitment = pd.DataFrame(columns=fitment_columns)
df_positions = pd.DataFrame({"Valid Tyre Positions": positions})

df_inventory.loc[0] = ["TYR-9001", "MRF", "Radial", "10.00 R20", "New", "15-08-2023", 22000, 80000, 0, 0, 0]
df_inventory.loc[1] = ["TYR-9002", "Apollo", "Nylon", "10.00 R20", "Rethreaded", "22-09-2023", 15000, 40000, 500, 3000, 1]
df_fitment.loc[0] = ["TYR-9001", "TN-01-AB-1234", "Axle 1 - Left", "16-08-2023", 120500, "", ""]
df_fitment.loc[1] = ["TYR-9002", "CGI-T002", "Axle 2 - Right 1", "25-09-2023", 85000, "10-12-2023", 95000]

with pd.ExcelWriter("Tyre_Management_Template.xlsx", engine="openpyxl") as writer:
    df_inventory.to_excel(writer, sheet_name="Tyre Inventory", index=False)
    df_fitment.to_excel(writer, sheet_name="Tyre Fitment", index=False)
    df_positions.to_excel(writer, sheet_name="Valid Positions", index=False)
    
    workbook = writer.book
    worksheet = writer.sheets["Tyre Fitment"]
    
    # Add Data Validation for Position column (Column C / Index 3)
    # The list of valid positions is in 'Valid Positions'!$A$2:$A$46
    dv = DataValidation(type="list", formula1="='Valid Positions'!$A$2:$A$46", allow_blank=True)
    # Add validation to C2 through C1000
    dv.add("C2:C1000")
    worksheet.add_data_validation(dv)
    
    # Adjust column widths for better readability
    for sheet_name in ["Tyre Inventory", "Tyre Fitment", "Valid Positions"]:
        ws = writer.sheets[sheet_name]
        for col in ws.columns:
            max_length = 0
            column = col[0].column_letter # Get the column name
            for cell in col:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            adjusted_width = (max_length + 2)
            ws.column_dimensions[column].width = adjusted_width

print("Excel template 'Tyre_Management_Template.xlsx' updated with exact options dropdown.")
