"""
Google Drive uploader for the scheduled Canaan ERP backup.

Adapted from the reference drive.py. Uses OAuth "installed app" credentials:
  - credentials.json : the OAuth client secret downloaded from Google Cloud Console
  - token.json       : the authorized user token (created on first run, then reused)

Both files live next to this module (backend/backup/). Do the first-time browser
authorization LOCALLY to generate token.json, then copy token.json to the server —
after that, refreshing is automatic and headless.
"""
import os

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.auth.exceptions import RefreshError
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

# drive.file = only files this app creates (least-privilege; enough for backups)
SCOPES = ["https://www.googleapis.com/auth/drive.file"]

_HERE = os.path.dirname(os.path.abspath(__file__))
CREDENTIALS_FILE = os.path.join(_HERE, "credentials.json")
TOKEN_FILE = os.path.join(_HERE, "token.json")


def get_credentials():
    """Return valid Drive credentials, refreshing or re-authorizing as needed."""
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except RefreshError:
                # Refresh token revoked/expired (e.g. OAuth app in "Testing" mode
                # expires tokens after 7 days) -> re-run the interactive auth flow.
                creds = None
        if not creds or not creds.valid:
            if not os.path.exists(CREDENTIALS_FILE):
                raise FileNotFoundError(
                    f"Missing {CREDENTIALS_FILE}. Download the OAuth client secret "
                    "from Google Cloud Console and place it here."
                )
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            # Needs a browser — run this once locally to mint token.json.
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, "w") as token:
            token.write(creds.to_json())
    return creds


def upload_file(filepath: str, folder_id: str | None = None) -> str:
    """Upload a single file to Drive (optionally into folder_id). Returns the Drive file id."""
    creds = get_credentials()
    service = build("drive", "v3", credentials=creds)

    file_metadata = {"name": os.path.basename(filepath)}
    if folder_id:
        file_metadata["parents"] = [folder_id]

    media = MediaFileUpload(filepath, resumable=True)
    file = service.files().create(
        body=file_metadata,
        media_body=media,
        fields="id",
    ).execute()

    return file.get("id")
