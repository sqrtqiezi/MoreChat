#!/bin/bash
# ABOUTME: 下载嵌入模型到部署包目录
# ABOUTME: 使用 Python huggingface_hub 下载 ONNX 格式的 BGE 中文模型

set -e

MODEL_ID="onnx-community/bge-small-zh-v1.5-ONNX"
TARGET_DIR="deploy-package/models/bge-small-zh-v1.5"

echo "=== 准备嵌入模型 ==="
echo "模型: $MODEL_ID"
echo "目标目录: $TARGET_DIR"

# 检查 Python 是否可用
if ! command -v python3 &> /dev/null; then
  echo "错误: 未找到 python3"
  exit 1
fi

# 检查 huggingface_hub 是否已安装
if ! python3 -c "import huggingface_hub" 2>/dev/null; then
  echo "安装 huggingface_hub..."
  pip3 install huggingface_hub
fi

# 创建目标目录
mkdir -p "$TARGET_DIR"

# 下载模型
echo "开始下载模型..."
python3 << EOF
from huggingface_hub import snapshot_download

snapshot_download(
    repo_id="$MODEL_ID",
    local_dir="$TARGET_DIR",
    local_dir_use_symlinks=False
)
print("模型下载完成")
EOF

echo ""
echo "=== 模型准备完成 ==="
echo "模型位置: $TARGET_DIR"
