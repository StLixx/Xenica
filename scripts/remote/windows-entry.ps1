param(
    [string] $Command = "hostname`npwd`ngit status --short`ngit log -1 --format='%H %s'",
    [ValidatePattern('^/opt/xenica-workspace(?:/[A-Za-z0-9_.-]+)*$')]
    [string] $Directory = '/opt/xenica-workspace/main'
)

$ErrorActionPreference = 'Stop'
if ($Directory -match '(^|/)\.\.?(/|$)') {
    throw 'Directory must stay inside the remote workspace.'
}
$taskScript = "set -e`ncd '$Directory'`n$Command`n"
$taskEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($taskScript))
& ssh -T -o BatchMode=yes -o ConnectTimeout=15 -o ControlPath=none xenica-infra "printf %s $taskEncoded | base64 -d | bash"
exit $LASTEXITCODE
