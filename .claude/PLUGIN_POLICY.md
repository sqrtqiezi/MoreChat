# Claude Code 插件管理规范

## 插件安装规则

### 默认规则
- **所有通过 marketplace 安装的插件必须安装到项目级别**
- 只有官方插件（如 `github@claude-plugins-official`）可以安装到用户级别
- 除非有特殊需求并经过明确批准，否则不得在用户级别安装 marketplace 插件

### 安装命令

**项目级别安装（推荐）：**
```bash
claude plugin install <plugin-name>@<marketplace> --project
```

**用户级别安装（仅限官方插件或特殊情况）：**
```bash
claude plugin install <plugin-name>@<marketplace>
```

### 检查已安装插件

```bash
# 查看所有插件
claude plugin list

# 查看项目级别插件
claude plugin list --project
```

### 卸载插件

```bash
# 卸载用户级别插件
claude plugin uninstall <plugin-name>@<marketplace>

# 卸载项目级别插件
claude plugin uninstall <plugin-name>@<marketplace> --project
```

## 自动检查

项目已配置 Git pre-commit hook，会自动检查用户级别的 marketplace 插件。如果检测到违规安装，提交将被阻止。

如果确实需要用户级别安装（经过批准），可以使用：
```bash
git commit --no-verify
```

## 当前配置

- 用户级别配置：`~/.claude/settings.json`
- 项目级别配置：`.claude/settings.json`
- Git hook：`.git/hooks/pre-commit`
