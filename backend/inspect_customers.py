import pandas as pd
import json

files = [
    '/Users/alanjoshua/Documents/Canaan-erp-v1/Customer List.xlsx',
    '/Users/alanjoshua/Documents/Canaan-erp-v1/Customer Pricing.xlsx',
    '/Users/alanjoshua/Documents/Canaan-erp-v1/Customer Destination.xlsx'
]

for f in files:
    print(f"\n--- {f} ---")
    try:
        df = pd.read_excel(f)
        print("Columns:", list(df.columns))
        print("Head:\n", df.head(2).to_dict(orient='records'))
    except Exception as e:
        print("Error:", e)
