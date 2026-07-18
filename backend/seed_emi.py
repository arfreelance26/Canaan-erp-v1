import pandas as pd
from database import SessionLocal
import models
import datetime

def main():
    db = SessionLocal()
    df = pd.read_excel("../CGI EMI Data.xlsx")
    
    # Clean NaN values
    df = df.where(pd.notnull(df), None)
    
    today = datetime.date.today()
    
    count = 0
    for idx, row in df.iterrows():
        emi_name = str(row['EMI Name / Title']).strip() if row['EMI Name / Title'] else ""
        truck_reg = str(row['Truck Registration Number']).strip() if row['Truck Registration Number'] else ""
        
        start_date_val = row['EMI Start Date (YYYY-MM-DD)']
        end_date_val = row['EMI End Date (YYYY-MM-DD)']
        
        start_date = pd.to_datetime(start_date_val, dayfirst=True).date() if pd.notnull(start_date_val) else None
        end_date = pd.to_datetime(end_date_val, dayfirst=True).date() if pd.notnull(end_date_val) else None
        
        loan_amount = float(row['Loan Amount']) if pd.notnull(row['Loan Amount']) else 0.0
        emi_amount = float(row['EMI Amount']) if pd.notnull(row['EMI Amount']) else 0.0
        bank_name = str(row['Bank Name']).strip() if row['Bank Name'] else ""
        loan_number = str(row['Loan Number']).strip() if row['Loan Number'] else ""
        
        tenure = int(row['Tenure (Months)']) if pd.notnull(row['Tenure (Months)']) else None
        if tenure is None and start_date and end_date:
            tenure = (end_date.year - start_date.year) * 12 + (end_date.month - start_date.month)
            
        cost_per_month = 0.0
        if tenure and tenure > 0 and loan_amount > 0:
            cost_per_month = loan_amount / tenure
        elif emi_amount > 0:
            cost_per_month = emi_amount
            
        payment_day_val = row.get('EMI Payment Date ')
        payment_day = int(payment_day_val) if pd.notnull(payment_day_val) else 1
        
        try:
            next_payment = datetime.date(today.year, today.month, payment_day)
            if next_payment < today:
                if today.month == 12:
                    next_payment = datetime.date(today.year + 1, 1, payment_day)
                else:
                    next_payment = datetime.date(today.year, today.month + 1, payment_day)
        except ValueError:
            next_payment = start_date
            
        record = models.EmiRecord(
            emi_name=emi_name,
            truck_registration=truck_reg,
            loan_number=loan_number,
            bank_name=bank_name,
            loan_amount=loan_amount,
            emi_start_date=start_date,
            emi_end_date=end_date,
            emi_amount=emi_amount,
            tenure_months=tenure,
            emi_payment_date=next_payment,
            cost_per_month=cost_per_month
        )
        db.add(record)
        count += 1
        
    db.commit()
    db.close()
    print(f"Successfully seeded {count} EMI records.")

if __name__ == "__main__":
    main()
