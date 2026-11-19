# Adds the month summary sheet to the workbook (first tab) and freezes the latest month column
# (formula -> value) in Dealer_Vol1, Dealer_Val1 and Dealer-MBD1. Uses Excel itself, so nothing else changes.
# .\add_summary.ps1 -Workbook <master.xlsx> -Summary <month_summary.xlsx>
param([string]$Workbook, [string]$Summary)
$ErrorActionPreference = 'Stop'
function Retry($f) { for ($i = 0; $i -lt 60; $i++) { try { return & $f } catch { if ("$_" -match '0x8001010A|0x80010001') { Start-Sleep -Milliseconds 500 } else { throw } } }; throw 'Excel stayed busy' }
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.AskToUpdateLinks = $false; $xl.EnableEvents = $false
try {
  $wb = $xl.Workbooks.Open($Workbook, 0, $false)
  try { $wb.AutoSaveOn = $false } catch {}           # OneDrive AutoSave would save half-done changes
  $xl.Calculation = -4135                             # manual while changing
  $sm = $xl.Workbooks.Open($Summary, 0, $true)
  $name = $sm.Worksheets.Item(1).Name
  foreach ($s in @($wb.Worksheets)) { if ($s.Name -eq $name) { $s.Delete(); "removed old copy: $name" } }
  $sm.Worksheets.Item(1).Copy($wb.Worksheets.Item(1)); $sm.Close($false)
  "added: $name as tab $($wb.Worksheets.Item($name).Index)"
  foreach ($sheet in @('Dealer_Vol1', 'Dealer_Val1', 'Dealer-MBD1')) {
    $ws = $wb.Worksheets.Item($sheet); $last = $ws.Cells($ws.Rows.Count, 5).End(-4162).Row
    $col = 0; for ($c = 13; $c -le 80; $c++) { if ($ws.Cells(1, $c).Value2 -is [double]) { $col = $c } }   # latest month column
    $hdr = [DateTime]::FromOADate($ws.Cells(1, $col).Value2).ToString('MMM-yy')
    $rng = $ws.Range($ws.Cells(2, $col), $ws.Cells($last, $col))
    $had = Retry { $rng.HasFormula }
    Retry { $rng.Value2 = $rng.Value2 } | Out-Null
    "$sheet $hdr (col $col, rows 2..$last): formulas before = $had -> now values"
  }
  $xl.Calculation = -4105
  Retry { $xl.CalculateFull() } | Out-Null
  Retry { $wb.Save() } | Out-Null; "saved: $($wb.Worksheets.Count) sheets"
  $wb.Close($false)
} finally { $xl.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl) }
