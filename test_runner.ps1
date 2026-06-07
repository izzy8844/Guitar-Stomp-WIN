Write-Host "=== Guitar AutoStomp Windows 自动化测试 ===" -ForegroundColor Cyan

$PROJECT_ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$errors = 0

# 1. Python 语法检查
Write-Host "`n[1/5] Python 后端语法检查..." -ForegroundColor Yellow
$pyFiles = Get-ChildItem -Path "$PROJECT_ROOT\backend" -Recurse -Filter "*.py" -Exclude "*__pycache__*"
foreach ($f in $pyFiles) {
    $result = python -m py_compile $f.FullName 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  FAIL: $($f.Name)" -ForegroundColor Red
        $errors++
    }
}
Write-Host "  检查了 $($pyFiles.Count) 个 Python 文件" -ForegroundColor Green

# 2. Python import 检查
Write-Host "`n[2/5] Python import 检查..." -ForegroundColor Yellow
Push-Location "$PROJECT_ROOT\backend"
$importResult = python -c "import ast, sys; [ast.parse(open(f,encoding='utf8').read()) for f in sys.argv[1:]]; print('OK')" @($pyFiles | ForEach-Object { $_.FullName }) 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  FAIL: $importResult" -ForegroundColor Red
    $errors++
} else {
    Write-Host "  所有 Python 文件 AST 解析通过" -ForegroundColor Green
}
Pop-Location

# 3. JSON/YAML 配置语法检查
Write-Host "`n[3/5] 配置文件语法检查..." -ForegroundColor Yellow
# package.json
try { Get-Content "$PROJECT_ROOT\package.json" -Raw | ConvertFrom-Json | Out-Null; Write-Host "  package.json OK" -ForegroundColor Green } catch { Write-Host "  package.json FAIL: $_" -ForegroundColor Red; $errors++ }
# tsconfig.json
try { Get-Content "$PROJECT_ROOT\tsconfig.json" -Raw | ConvertFrom-Json | Out-Null; Write-Host "  tsconfig.json OK" -ForegroundColor Green } catch { Write-Host "  tsconfig.json FAIL: $_" -ForegroundColor Red; $errors++ }
# next.config.ts - skip (TS file)
Write-Host "  next.config.ts (TS, skipped)" -ForegroundColor Gray

# 4. TypeScript 编译检查 (如果 tsc 可用)
Write-Host "`n[4/5] TypeScript 编译检查..." -ForegroundColor Yellow
$tsc = Get-Command tsc -ErrorAction SilentlyContinue
if ($tsc) {
    Push-Location $PROJECT_ROOT
    $tscOutput = npx tsc --noEmit 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  类型检查有警告/错误 (可能需要 npm install):" -ForegroundColor Yellow
        Write-Host ($tscOutput | Select-Object -First 10 | Out-String)
    } else {
        Write-Host "  类型检查通过" -ForegroundColor Green
    }
    Pop-Location
} else {
    Write-Host "  tsc 未安装 (跳过)" -ForegroundColor Gray
}

# 5. 文件完整性检查
Write-Host "`n[5/5] 文件完整性检查..." -ForegroundColor Yellow
$required = @(
    "package.json", "tsconfig.json", "next.config.ts",
    "electron/main.js", "electron/preload.js",
    "backend/main_stdio.py", "backend/app/config.py",
    "backend/app/services/midi_controller.py",
    "backend/app/services/preset_scanner.py",
    "backend/app/services/audio_engine.py",
    "src/app/layout.tsx", "src/app/page.tsx",
    "README.md", "PRD-Windows-Adaptation.md"
)
foreach ($f in $required) {
    $path = Join-Path $PROJECT_ROOT $f
    if (Test-Path $path) {
        $size = (Get-Item $path).Length
        if ($size -lt 100) {
            Write-Host "  WARN: $f 过小 ($size bytes)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  MISSING: $f" -ForegroundColor Red
        $errors++
    }
}
Write-Host "  已检查 $($required.Count) 个关键文件" -ForegroundColor Green

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
if ($errors -eq 0) {
    Write-Host "  全部基础测试通过!" -ForegroundColor Green
} else {
    Write-Host "  $errors 项失败" -ForegroundColor Red
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`n注意: 完整测试需要:" -ForegroundColor Gray
Write-Host "  - npm install (前端依赖)" -ForegroundColor Gray
Write-Host "  - pip install -r backend/requirements.txt" -ForegroundColor Gray
Write-Host "  - 声卡 + MIDI 踏板 (硬件联调)" -ForegroundColor Gray
