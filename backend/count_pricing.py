import pandas as pd

df1 = pd.read_excel('/Users/alanjoshua/Documents/Canaan-erp-v1/Customer Pricing.xlsx')
print(f"Total rows in Pricing: {len(df1)}")

df2 = pd.read_excel('/Users/alanjoshua/Documents/Canaan-erp-v1/Customer Destination.xlsx')
print(f"Total rows in Destination: {len(df2)}")
