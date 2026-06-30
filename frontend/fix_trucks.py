import re

with open("src/components/fleet/TruckFormDialog.tsx", "r") as f:
    content = f.read()

# Add import
if "FilePreviewBadge" not in content:
    content = content.replace(
        'import { GlassCombobox } from "@/components/ui/GlassCombobox";',
        'import { GlassCombobox } from "@/components/ui/GlassCombobox";\nimport { FilePreviewBadge } from "@/components/ui/FilePreviewBadge";'
    )

# The replacements mapping fieldName -> field attribute
replacements = [
    ("truckPhotosFileName", "files.photo", "photo"),
    ("rcDocumentFileName", "files.rc", "rc"),
    ("fcDocumentFileName", "files.fc", "fc"),
    ("roadTaxDocumentFileName", "files.road_tax", "road_tax"),
    ("insuranceDocumentProofFileName", "files.insurance_proof", "insurance"),
    ("nationalPermitProofFileName", "files.national_permit", "national_permit"),
    ("localPermitProofFileName", "files.local_permit", "local_permit"),
    ("pollutionCertificateFileName", "files.pollution_cert", "pollution_cert"),
]

for form_field, file_field, entity_field in replacements:
    pattern = (
        r'\{form\.' + form_field + r' && \(\s*'
        r'<span className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">\s*'
        r'<FileText className="h-3.5 w-3.5" />\s*'
        r'\{form\.' + form_field + r'\}\s*'
        r'</span>\s*'
        r'\)\}'
    )
    
    replacement = (
        r'<FilePreviewBadge\n'
        r'              fileName={form.' + form_field + '}\n'
        r'              fileObj={' + file_field + '}\n'
        r'              entity="trucks"\n'
        r'              entityId={initialData?.id}\n'
        r'              field="' + entity_field + '"\n'
        r'            />'
    )
    
    content = re.sub(pattern, replacement, content)

with open("src/components/fleet/TruckFormDialog.tsx", "w") as f:
    f.write(content)
