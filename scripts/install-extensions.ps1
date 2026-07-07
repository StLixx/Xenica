# Install pgvector extension
$pgVectorZip = "$env:TEMP\vector.v0.8.2-pg17.zip"
$extractDir = "$env:TEMP\pgvector"

if (-not (Test-Path $extractDir)) {
    Expand-Archive -Path $pgVectorZip -DestinationPath $extractDir -Force
}

Write-Host "Copying pgvector extension files..."
Copy-Item "$extractDir\share\extension\*" "C:\Program Files\PostgreSQL\17\share\extension\" -Force
Copy-Item "$extractDir\lib\vector.dll" "C:\Program Files\PostgreSQL\17\lib\" -Force
Write-Host "pgvector installed."
