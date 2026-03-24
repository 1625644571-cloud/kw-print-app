#!/bin/bash

# ============================================
# 库位码自动打印APP - 一键构建脚本
# ============================================

set -e  # 遇到错误立即退出

echo "=============================================="
echo "   库位码自动打印APK - 一键构建脚本"
echo "=============================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 函数：打印信息
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# 检查依赖
print_info "检查构建依赖..."

if ! command -v node &> /dev/null; then
    print_error "Node.js 未安装，请先安装 Node.js 16+"
    print_info "安装方法：brew install node"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    print_error "Node.js 版本过低，当前版本：$(node -v)，需要 16+"
    exit 1
fi
print_success "Node.js 版本：$(node -v) ✓"

if ! command -v java &> /dev/null; then
    print_error "JDK 未安装，请先安装 JDK 11+"
    print_info "安装方法：brew install openjdk@11"
    exit 1
fi
print_success "JDK 版本：$(java -version 2>&1 | head -n 1) ✓"

# 检查 Android SDK
ANDROID_SDK_ROOT=${ANDROID_HOME:-$ANDROID_SDK_ROOT}
if [ -z "$ANDROID_SDK_ROOT" ]; then
    # 尝试查找 Android SDK
    if [ -d "$HOME/Library/Android/sdk" ]; then
        ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
        export ANDROID_SDK_ROOT
    elif [ -d "$HOME/Android/Sdk" ]; then
        ANDROID_SDK_ROOT="$HOME/Android/Sdk"
        export ANDROID_SDK_ROOT
    else
        print_warning "未找到 Android SDK，请确保已安装 Android Studio"
        print_info "如果已安装，请设置环境变量：export ANDROID_HOME=/path/to/sdk"
        read -p "是否继续构建？(y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi
if [ -n "$ANDROID_SDK_ROOT" ]; then
    print_success "Android SDK：$ANDROID_SDK_ROOT ✓"
fi

# 进入项目目录
cd "$(dirname "$0")"
PROJECT_DIR=$(pwd)

echo ""
print_info "项目目录：$PROJECT_DIR"

# 检查必要的文件
if [ ! -f "package.json" ]; then
    print_error "未找到 package.json 文件"
    exit 1
fi

if [ ! -f "index.html" ]; then
    print_error "未找到 index.html 文件"
    exit 1
fi

print_success "项目文件检查通过 ✓"

echo ""
print_info "开始构建流程..."
echo ""

# 步骤1：安装 npm 依赖
print_info "步骤 1/6: 安装 npm 依赖..."
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
    npm install
    print_success "npm 依赖安装完成 ✓"
else
    print_warning "node_modules 已存在，跳过安装"
fi

# 步骤2：检查是否已初始化 Capacitor
print_info "步骤 2/6: 检查 Capacitor 配置..."
if [ -f "capacitor.config.json" ]; then
    print_success "Capacitor 配置文件已存在 ✓"
else
    print_error "未找到 capacitor.config.json 文件"
    exit 1
fi

# 步骤3：初始化/更新 Capacitor
print_info "步骤 3/6: 配置 Capacitor 项目..."
CAPACITOR_APP_ID="com.kwprint.app"
CAPACITOR_APP_NAME="库位码打印"

# 检查是否已经初始化
if [ -f ".capacitor.config.json" ]; then
    print_warning "Capacitor 已初始化，更新配置..."
    npx cap sync
else
    print_info "首次初始化 Capacitor 项目..."
    # 自动输入配置
    echo "$CAPACITOR_APP_ID" | npx cap init "$CAPACITOR_APP_NAME" "$CAPACITOR_APP_ID" --web-dir=. || true

    # 创建 .capacitor.config.json
    cat > .capacitor.config.json << EOF
{
  "appId": "$CAPACITOR_APP_ID",
  "appName": "$CAPACITOR_APP_NAME",
  "webDir": ".",
  "bundledWebRuntime": false
}
EOF
    print_success "Capacitor 初始化完成 ✓"
fi

# 步骤4：添加 Android 平台
print_info "步骤 4/6: 添加/更新 Android 平台..."
if [ ! -d "android" ]; then
    npx cap add android
    print_success "Android 平台添加完成 ✓"
else
    print_warning "Android 平台已存在，更新配置..."
    npx cap sync
    print_success "Android 平台同步完成 ✓"
fi

# 步骤5：同步代码到 Android 项目
print_info "步骤 5/6: 同步代码到 Android 项目..."
npx cap sync android
print_success "代码同步完成 ✓"

# 步骤6：构建 APK
print_info "步骤 6/6: 构建 APK..."
echo ""

cd android

# 检查是否安装了 Gradle Wrapper
if [ ! -f "gradlew" ]; then
    print_error "未找到 gradlew 文件，请确保已正确配置 Android 项目"
    cd ..
    exit 1
fi

# 检查是否可执行
if [ ! -x "gradlew" ]; then
    print_info "添加 gradlew 执行权限..."
    chmod +x gradlew
fi

print_info "正在编译 APK，这可能需要几分钟..."

# 清理旧的构建文件
print_info "清理旧的构建文件..."
./gradlew clean

# 构建 Debug APK
print_info "构建 Debug APK..."
./gradlew assembleDebug --stacktrace

if [ $? -ne 0 ]; then
    print_error "APK 构建失败"
    cd ..
    exit 1
fi

# 复制 APK 到项目根目录
print_info "复制 APK 到项目目录..."
if [ -f "app/build/outputs/apk/debug/app-debug.apk" ]; then
    cp app/build/outputs/apk/debug/app-debug.apk ../kw-print-app.apk
    print_success "APK 文件生成成功 ✓"

    # 获取 APK 文件大小
    APK_SIZE=$(du -h ../kw-print-app.apk | cut -f1)
    print_info "APK 大小：$APK_SIZE"
else
    print_error "未找到生成的 APK 文件"
    cd ..
    exit 1
fi

cd ..

echo ""
echo "=============================================="
print_success "构建完成！"
echo "=============================================="
echo ""
print_info "APK 文件位置：$PROJECT_DIR/kw-print-app.apk"
print_info "APK 大小：$APK_SIZE"
echo ""
print_info "安装方法："
echo "  1. 将 kw-print-app.apk 复制到手机"
echo "  2. 在手机上点击安装"
echo "  3. 授予蓝牙、位置等权限"
echo "  4. 打开应用即可使用"
echo ""
print_warning "注意：首次使用建议先进行测试打印，确认打印机工作正常。"
echo ""
echo "=============================================="

# 询问是否打开文件夹
read -p "是否打开 APK 所在文件夹？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        open .
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        xdg-open .
    elif [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "msys" ]]; then
        # Windows
        explorer .
    fi
fi

# 询问是否安装到手机
read -p "手机已连接并启用USB调试，是否直接安装？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v adb &> /dev/null; then
        print_info "正在安装到手机..."
        adb install kw-print-app.apk
        if [ $? -eq 0 ]; then
            print_success "安装成功！"
            print_info "现在可以在手机上打开应用了。"
        else
            print_error "安装失败，请检查："
            print_info "  1. 手机是否已连接并启用USB调试"
            print_info "  2. 是否已授权电脑调试"
            print_info "  3. 手动安装 kw-print-app.apk 文件"
        fi
    else
        print_warning "未找到 adb 命令，请手动安装 APK 文件"
        print_info "安装 adb：brew install android-platform-tools"
    fi
fi

echo ""
print_success "构建脚本执行完毕！"
