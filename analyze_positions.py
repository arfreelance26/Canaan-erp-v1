import pandas as pd
import json

file_path = "Tyre Management CGI.xlsx"
df = pd.read_excel(file_path, sheet_name=0) # Assuming the first sheet

# Let's find the column that looks like Position
position_col = None
for col in df.columns:
    if 'position' in str(col).lower():
        position_col = col
        break

if position_col:
    unique_positions = df[position_col].dropna().unique().tolist()
    print("Found position column:", position_col)
    print("Unique positions in Excel:", json.dumps(unique_positions, indent=2))
else:
    print("No position column found. Columns are:", df.columns.tolist())
