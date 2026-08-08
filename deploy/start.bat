@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
REM ==========================================================
REM  飞虹智-企业AI一站式平台 V1.0 一键部署脚本（Windows）
REM  研发主体：晋江市飞虹智科技企业管理有限公司 · 飞扬企源研发中心
REM  项目负责人：吴赐虹
REM ==========================================================

cd /d "%~dp0.."
set "ROOT=%cd%"

echo [飞扬企源] 检查 Docker 运行环境...
where docker >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 docker，请先安装 Docker Desktop
    pause & exit /b 1
)
docker info >nul 2>&1
if errorlevel 1 (
    echo [错误] Docker 服务未启动，请先启动 Docker Desktop
    pause & exit /b 1
)

docker compose version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 docker compose 插件，请升级 Docker Desktop
    pause & exit /b 1
)
echo [飞扬企源] Docker 环境正常

if not exist "%ROOT%\.env" (
    copy "%ROOT%\.env.example" "%ROOT%\.env" >nul
    echo [提示] 已由 .env.example 生成 .env，生产环境请务必修改 JWT_SECRET 与各项密码
)

echo [飞扬企源] 开始构建镜像，首次执行需拉取基础镜像，请耐心等待...
docker compose build
if errorlevel 1 (
    echo [错误] 镜像构建失败，请检查上方日志
    pause & exit /b 1
)

echo [飞扬企源] 启动全部服务...
docker compose up -d
if errorlevel 1 (
    echo [错误] 服务启动失败，请检查上方日志
    pause & exit /b 1
)

echo [飞扬企源] 等待后端就绪（Milvus 首次启动约需 1-2 分钟）...
set /a TRY=0
:WAITLOOP
set /a TRY+=1
curl -fsS http://127.0.0.1:8080/health >nul 2>&1
if not errorlevel 1 goto READY
if %TRY% GEQ 60 (
    echo [提示] 后端在 5 分钟内未就绪，请执行 docker compose logs -f backend 查看日志
    goto RESULT
)
timeout /t 5 /nobreak >nul
goto WAITLOOP

:READY
echo [飞扬企源] 后端服务已就绪

:RESULT
echo.
echo ======================================================
echo   飞虹智-企业AI一站式平台 V1.0 部署完成
echo ======================================================
echo   访问地址      http://localhost:8000
echo   后端接口      http://localhost:8080/api
echo.
echo   演示账号（初始密码 123456）
echo     admin      企业管理员    全模块权限
echo     sales01    销售主管      本部门数据
echo     sales02    销售专员      仅本人数据
echo     partner01  区域合伙人    合伙人中心
echo     stock01    仓储主管      进销存
echo     superadmin 平台超管      密码 admin@2026
echo.
echo   常用命令
echo     查看日志    docker compose logs -f backend
echo     停止服务    docker compose down
echo     清空数据    docker compose down -v
echo ======================================================
pause
