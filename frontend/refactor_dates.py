import os, re

files_to_check = [
    'src/components/finance/EmiFormDialog.tsx',
    'src/components/maintenance/MaintenanceRecordFormDialog.tsx',
    'src/components/drivers/DriverFormDialog.tsx',
    'src/components/trips/TripFormDialog.tsx',
    'src/components/maintenance/MaintenanceRecordHistoryDialog.tsx',
    'src/components/fleet/FuelLogFormDialog.tsx',
    'src/components/compensation/PaymentDialog.tsx',
    'src/components/fleet/TruckFormDialog.tsx',
    'src/components/trips/TripSheetDialog.tsx',
    'src/components/customers/CustomerPricingFormDialog.tsx',
    'src/components/attendance/LeaveRequestFormDialog.tsx',
    'src/components/staff/StaffFormDialog.tsx',
    'src/components/trips/CloseTripDialog.tsx',
    'src/components/tyre-inventory/TyreInventoryFormDialog.tsx'
]

import_statement = 'import { DatePicker } from "@/components/ui/DatePicker";\nimport { format } from "date-fns";\n'

for fpath in files_to_check:
    if not os.path.exists(fpath): continue
    
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if '<input' not in content or 'type="date"' not in content:
        continue

    # Inject imports if not present
    if 'DatePicker' not in content:
        last_import_match = list(re.finditer(r'^import .*?;?\n', content, re.MULTILINE))
        if last_import_match:
            last_import = last_import_match[-1]
            insert_pos = last_import.end()
            content = content[:insert_pos] + import_statement + content[insert_pos:]
    
    # Updated regex to match the self-closing slash if present
    pattern = r'<input\s+type="date"([^>]*)value=\{(.*?)\}([^>]*)onChange=\{\(e\) => (update\("(.*?)",\s*e\.target\.value\)|setFilter\(\(prev\) => \(\{\s*\.\.\.prev,\s*date:\s*e\.target\.value\s*\}\)\)|setForm\(\(prev\) => \(\{\s*\.\.\.prev,\s*(.*?):\s*e\.target\.value\s*\}\)\)|set\("(.*?)",\s*e\.target\.value\)|setDate\(e\.target\.value\)|setCustomFrom\(e\.target\.value\)|setCustomTo\(e\.target\.value\)|setFilterDate\(e\.target\.value\))\}([^>]*?)/?>'
    
    def replacer(m):
        pre_val = m.group(1)
        val = m.group(2)
        mid = m.group(3)
        on_change_full = m.group(4)
        field_name = m.group(5)
        form_field_name = m.group(6)
        set_field_name = m.group(7)
        post_on_change = m.group(8)
        
        pre_val = re.sub(r'className=\{.*?\}', '', pre_val)
        mid = re.sub(r'className=\{.*?\}', '', mid)
        post_on_change = re.sub(r'className=\{.*?\}', '', post_on_change)
        
        if field_name:
            new_on_change = f'onChange={{(d: any) => d && update("{field_name}", format(d, "yyyy-MM-dd"))}}'
        elif form_field_name:
            new_on_change = f'onChange={{(d: any) => d && setForm((prev: any) => ({{ ...prev, {form_field_name}: format(d, "yyyy-MM-dd") }}))}}'
        elif set_field_name:
            new_on_change = f'onChange={{(d: any) => d && set("{set_field_name}", format(d, "yyyy-MM-dd"))}}'
        elif "setDate" in on_change_full:
            new_on_change = f'onChange={{(d: any) => d && setDate(format(d, "yyyy-MM-dd"))}}'
        elif "setCustomFrom" in on_change_full:
            new_on_change = f'onChange={{(d: any) => d ? setCustomFrom(format(d, "yyyy-MM-dd")) : setCustomFrom("")}}'
        elif "setCustomTo" in on_change_full:
            new_on_change = f'onChange={{(d: any) => d ? setCustomTo(format(d, "yyyy-MM-dd")) : setCustomTo("")}}'
        elif "setFilterDate" in on_change_full:
            new_on_change = f'onChange={{(d: any) => d ? setFilterDate(format(d, "yyyy-MM-dd")) : setFilterDate("")}}'
        else:
            new_on_change = f'onChange={{(d: any) => d && setFilter((prev: any) => ({{ ...prev, date: format(d, "yyyy-MM-dd") }}))}}'
        
        return f'<DatePicker{pre_val}value={{{val}}}{mid}{new_on_change}{post_on_change}/>'
    
    new_content = re.sub(pattern, replacer, content)
    
    if new_content != content:
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f'Updated {fpath}')
