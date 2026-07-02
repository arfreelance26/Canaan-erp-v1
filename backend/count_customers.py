import pandas as pd

df = pd.read_excel('/Users/alanjoshua/Documents/Canaan-erp-v1/Customer List.xlsx')
print(f"Total rows in Excel: {len(df)}")

df_clean = df.dropna(subset=['Customer Name*'])
print(f"Rows with non-null Customer Name: {len(df_clean)}")

unique_customers = df_clean['Customer Name*'].str.upper().str.strip().nunique()
print(f"Unique Customer Names (case-insensitive): {unique_customers}")
