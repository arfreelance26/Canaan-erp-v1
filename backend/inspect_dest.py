import pandas as pd
import json

df = pd.read_excel('/Users/alanjoshua/Documents/Canaan-erp-v1/Customer Destination.xlsx')
print("Total rows:", len(df))
print("Rows with NaN Customer Name:", df['Customer Name*'].isna().sum())
print("First 10 non-NaN Customer Names:", df[df['Customer Name*'].notna()]['Customer Name*'].head(10).tolist())
