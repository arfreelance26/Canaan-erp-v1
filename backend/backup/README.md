# Scheduled Google Drive Backup

Every night this job builds the same three artifacts available on the Admin
dashboard — **Excel workbook**, **SQL dump**, and the **documents/photos archive** —
packs them into a single zip, and uploads it to a Google Drive folder.

```
canaan_erp_backup_YYYYMMDD_HHMMSS.zip
├── canaan_erp_backup.xlsx     # every table, one sheet each
├── canaan_erp_backup.sql      # INSERT statements to restore the DB
└── canaan_erp_files.zip       # all uploaded photos/documents + MANIFEST.csv
```

## Files

| File | Purpose |
|---|---|
| `run_backup.py` | Builds the combined zip and uploads it (main entry point) |
| `drive_uploader.py` | Google Drive OAuth + upload (from your `drive.py`) |
| `run_backup.sh` | Cron wrapper (resolves venv + paths, loads `backup.env`) |
| `credentials.json` | **You provide** — OAuth client secret (git-ignored) |
| `token.json` | Auto-created on first authorization (git-ignored) |
| `backup.env` | **You provide** — config, e.g. the Drive folder id (git-ignored) |

## One-time setup

### 1. Install dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 2. Add Google OAuth credentials
Put your `credentials.json` (OAuth *Desktop app* client secret from Google Cloud
Console, Drive API enabled) into `backend/backup/`. You can reuse the one from
`~/Desktop/testing/`:
```bash
cp ~/Desktop/testing/credentials.json backend/backup/
cp ~/Desktop/testing/token.json       backend/backup/   # optional: reuse existing auth
```

### 3. Pick the Drive destination folder
Create a folder in Google Drive (e.g. "Canaan ERP Backups"), open it, and copy the
id from the URL (`drive.google.com/drive/folders/<THIS_ID>`). Then create
`backend/backup/backup.env`:
```
GDRIVE_BACKUP_FOLDER_ID=your_folder_id_here
# BACKUP_KEEP_LOCAL=1   # uncomment to also keep a copy in backend/backup/archives/
```

### 4. Authorize once (creates token.json)
Run it manually the first time — a browser window opens for Google sign-in:
```bash
cd backend && python backup/run_backup.py
```
After this, `token.json` is saved and refreshes automatically (no browser needed).
> If your OAuth app is in "Testing" mode, Google expires the refresh token after
> ~7 days. For an unattended production job, publish the OAuth app (or use a
> service account) so the token doesn't expire.

## Schedule at 3:00 AM daily

Make the wrapper executable, then add a cron entry:
```bash
chmod +x backend/backup/run_backup.sh
crontab -e
```
Add this line (adjust the absolute path):
```cron
0 3 * * *  /Users/alanjoshua/Documents/Canaan-erp-v1/backend/backup/run_backup.sh >> /Users/alanjoshua/Documents/Canaan-erp-v1/backend/backup/backup.log 2>&1
```
- `0 3 * * *` = every day at 03:00 (server local time).
- Output (success/failure) is appended to `backup.log`.

**macOS note:** grant `cron`/your terminal Full Disk Access (System Settings →
Privacy & Security) or the job may be sandbox-blocked. On the production Linux
server, add the same cron line via the hosting panel or `crontab -e`.

## Test without waiting for 3 AM
```bash
cd backend && python backup/run_backup.py
```
