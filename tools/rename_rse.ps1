# RSE -> SE in the master workbook: sheet names and the label cells listed in a JSON file
# ([sheet, cell, new text] from rse_cells.py). Only constant cells are changed; formulas are left alone.
param([string]$Workbook, [string]$Cells)
$ErrorActionPreference = 'Stop'
function Retry($f) { for ($i = 0; $i -lt 120; $i++) { try { return & $f } catch { if ("$_" -match '0x8001010A|0x80010001') { Start-Sleep -Milliseconds 500 } else { throw } } }; throw 'Excel stayed busy' }
$list = Get-Content -Raw -Encoding UTF8 $Cells | ConvertFrom-Json
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.AskToUpdateLinks = $false; $xl.EnableEvents = $false
try {
  $wb = $xl.Workbooks.Open($Workbook, 0, $false)
  try { $wb.AutoSaveOn = $false } catch {}
  $xl.Calculation = -4135
  $n = 0; $skip = 0
  foreach ($it in $list) {
    $ws = $wb.Worksheets.Item($it[0]); $c = $ws.Range($it[1])
    if ($c.HasFormula) { $skip++; continue }
    $c.Value2 = $it[2]; $n++
  }
  "labels changed: $n (skipped formulas: $skip)"
  foreach ($pair in @(@('Dashboard RSE', 'Dashboard SE'), @('RSE wise nov target', 'SE wise nov target'))) {
    foreach ($s in @($wb.Worksheets)) { if ($s.Name -eq $pair[0]) { $s.Name = $pair[1]; "sheet renamed: $($pair[0]) -> $($pair[1])" } }
  }
  $xl.Calculation = -4105
  Retry { $xl.CalculateFull() } | Out-Null
  Retry { $wb.Save() } | Out-Null; 'saved'
  Retry { $wb.Close($false) } | Out-Null
} finally { $xl.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl) }
