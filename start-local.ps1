Set-Location $PSScriptRoot
$python = if (Test-Path .venv/Scripts/python.exe) { '.venv/Scripts/python.exe' } else { 'python' }
& $python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
