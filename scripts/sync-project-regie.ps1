param([string]$InvoiceRoot = (Join-Path $PSScriptRoot '../../Timo_Rechnungsprogramm'))
$sourceRoot = Split-Path $PSScriptRoot
foreach ($file in @('src/utils/manualEntryNotes.ts', 'src/utils/projectRegie.ts', 'src/utils/projectRegiePdf.ts', 'src/services/projectRegieStore.ts')) {
  Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination (Join-Path $InvoiceRoot $file)
}
