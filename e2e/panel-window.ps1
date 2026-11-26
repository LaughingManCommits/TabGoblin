# Reads and presses the TabGoblin server's real window, for the end-to-end suite (run.mjs).
#
# The window is a desktop window of the server's own process, so the suite's browser driver does
# not reach it. This goes through the accessibility interface of Windows (UI Automation), which is
# what a screen reader uses: it names what is in the window and presses a button as a person would.
# Nothing of the screen is captured.
#
#   -Port <n>            which server: the one whose window shows "Port <n>" under its title
#   -Action read         prints {"found":true,"title":"...","process":<id>,"names":[...]}, or {"found":false}
#   -Action press        presses the control named -Name; prints {"found":true,"pressed":true}
#
# It prints one JSON object. A control that is not there is {"found":true,"pressed":false}.
param(
  [Parameter(Mandatory = $true)][int]$Port,
  [ValidateSet('read', 'press')][string]$Action = 'read',
  [string]$Name = ''
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$automation = [System.Windows.Automation.AutomationElement]
$scope = [System.Windows.Automation.TreeScope]
$everything = [System.Windows.Automation.Condition]::TrueCondition

function Get-Names($window) {
  $names = New-Object System.Collections.Generic.List[string]
  foreach ($element in $window.FindAll($scope::Descendants, $everything)) {
    if ($element.Current.Name) { $names.Add($element.Current.Name) }
    # The log is a text area: what it holds is its value, not its name.
    $pattern = $null
    if ($element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
      if ($pattern.Current.Value) { $names.Add($pattern.Current.Value) }
    }
  }
  return $names
}

# The server's window among all windows: by its title, and by the port it shows. The user's own
# server may have its window open as well, and a console can carry the same title.
$found = $null
$names = $null
foreach ($window in $automation::RootElement.FindAll($scope::Children, $everything)) {
  if ($window.Current.Name -notlike 'TabGoblin server*' -or $window.Current.ClassName -like '*Console*') { continue }
  $its = Get-Names $window
  if ($its | Where-Object { $_ -like "Port $Port*" }) {
    $found = $window
    $names = $its
    break
  }
}
if (-not $found) {
  '{"found":false}'
  exit 0
}

if ($Action -eq 'read') {
  [pscustomobject]@{ found = $true; title = $found.Current.Name; process = $found.Current.ProcessId; names = @($names) } | ConvertTo-Json -Compress -Depth 3
  exit 0
}

# A label can carry the same words as the control beside it: the one that can be pressed is meant.
$pressed = $false
foreach ($element in $found.FindAll($scope::Descendants, $everything)) {
  if ($element.Current.Name -ne $Name) { continue }
  $pattern = $null
  if ($element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
    try { $pattern.Invoke() } catch [System.Runtime.InteropServices.COMException] {
      # A button that ends the server's process at once takes the answer to the press with it.
    }
    $pressed = $true
    break
  }
  if ($element.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$pattern)) {
    $pattern.Toggle()
    $pressed = $true
    break
  }
}
[pscustomobject]@{ found = $true; pressed = $pressed } | ConvertTo-Json -Compress
