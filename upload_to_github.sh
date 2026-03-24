#!/bin/bash
# 一键上传到GitHub并触发APK构建

set -e

echo "=================================="
echo "  库位码打印APP - 一键上传到GitHub"
echo "=================================="
echo ""

# 检查git是否安装
if ! command -v git &> /dev/null; then
    echo "❌ 未安装git，请先安装：brew install git"
    exit 1
fi

# 获取GitHub用户名
read -p "请输入你的GitHub用户名: " GITHUB_USER
if [ -z "$GITHUB_USER" ]; then
    echo "❌ 用户名不能为空"
    exit 1
fi

REPO_NAME="kw-print-app"
REPO_URL="https://github.com/$GITHUB_USER/$REPO_NAME.git"

echo ""
echo "📋 即将进行以下操作："
echo "   1. 初始化Git仓库"
echo "   2. 提交所有代码"
echo "   3. 推送到 $REPO_URL"
echo "   4. GitHub Actions自动开始构建APK"
echo ""
echo "⚠️  请先在GitHub创建仓库："
echo "   https://github.com/new"
echo "   仓库名称: $REPO_NAME"
echo "   可见性: Public（免费账号需要Public才能用Actions）"
echo ""
read -p "✅ 已创建好GitHub仓库？(y/n): " CONFIRMED
if [ "$CONFIRMED" != "y" ] && [ "$CONFIRMED" != "Y" ]; then
    echo "请先创建GitHub仓库再运行此脚本"
    exit 0
fi

# 初始化git
if [ ! -d ".git" ]; then
    echo "📁 初始化Git仓库..."
    git init
    git branch -M main
fi

# 添加所有文件
echo "📦 添加文件..."
git add .
git commit -m "Add kw-print-app v1.0.0" 2>/dev/null || echo "无新改动"

# 设置远程仓库
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"

# 推送
echo ""
echo "🚀 推送到GitHub..."
echo "（需要输入GitHub密码/Token）"
git push -u origin main

echo ""
echo "=================================="
echo "✅ 上传成功！"
echo ""
echo "📱 获取APK步骤："
echo "   1. 打开: https://github.com/$GITHUB_USER/$REPO_NAME/actions"
echo "   2. 等待构建完成（约5-8分钟）"
echo "   3. 点击构建记录 → 找到 Artifacts"
echo "   4. 下载 kw-print-app-debug.zip"
echo "   5. 解压得到 app-debug.apk"
echo "   6. 发送到手机安装！"
echo "=================================="
