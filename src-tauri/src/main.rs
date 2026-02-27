// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
struct PRInfo {
    id: i64,
    number: i64,
    title: String,
    state: String,
    html_url: String,
    head_sha: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct CheckRun {
    id: i64,
    name: String,
    status: String,
    conclusion: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct PRDetails {
    pr: PRInfo,
    check_runs: Vec<CheckRun>,
}

// 获取PR信息 - 实际应用会调用GitHub API
#[tauri::command]
async fn fetch_pr_info(repo: String, number: i64) -> Result<PRDetails, String> {
    // 这里应该调用GitHub API
    // 示例返回
    Ok(PRDetails {
        pr: PRInfo {
            id: number,
            number,
            title: format!("PR #{} from {}", number, repo),
            state: "open".to_string(),
            html_url: format!("https://github.com/{}/pull/{}", repo, number),
            head_sha: "abc123".to_string(),
        },
        check_runs: vec![],
    })
}

// 获取所有跟踪的PR
#[tauri::command]
async fn fetch_tracked_prs() -> Result<Vec<PRDetails>, String> {
    // 从本地存储读取并查询GitHub API
    Ok(vec![])
}

// 添加PR到跟踪列表
#[tauri::command]
async fn add_tracked_pr(repo: String, number: i64) -> Result<(), String> {
    println!("Adding PR: {}/{}", repo, number);
    // 保存到本地存储
    Ok(())
}

// 删除跟踪的PR
#[tauri::command]
async fn remove_tracked_pr(repo: String, number: i64) -> Result<(), String> {
    println!("Removing PR: {}/{}", repo, number);
    Ok(())
}

// 调试日志 - 打印到终端
#[tauri::command]
fn debug_log(message: String) {
    println!("[DEBUG] {}", message);
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn escape_applescript(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

// 打开终端并运行命令
#[tauri::command]
async fn open_cli(
    command_template: String,
    context: String,
    repo: String,
    number: i64,
    pr_url: String,
) -> Result<(), String> {
    let command_template = command_template.trim().to_string();
    if command_template.is_empty() {
        return Err("CLI command template is empty".to_string());
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (command_template, context, repo, number, pr_url);
        return Err("open_cli is only available on macOS".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        // 构建包含仓库和PR信息的上下文
        let skill_context = format!(
            r#"使用 skill:ci-failure-analyzer 来分析以下 CI 失败问题。

仓库: {}
PR: #{}
链接: {}

注意：不要直接推送修改，先给出修复建议，等待用户确认后再操作。

"#,
            repo, number, pr_url
        );

        let full_input = format!("{}{}", skill_context, context);
        let mut command = command_template;
        command = command.replace("{context}", &shell_quote(&full_input));
        command = command.replace("{repo}", &shell_quote(&repo));
        command = command.replace("{number}", &number.to_string());
        command = command.replace("{pr_url}", &shell_quote(&pr_url));

        let escaped_command = escape_applescript(&command);
        let script = format!(
            r#"tell application "iTerm"
    activate
    create window with default profile
    tell current session of window 1
        write text "{}"
    end tell
end tell"#,
            escaped_command
        );

        std::process::Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .spawn()
            .map_err(|e| e.to_string())?;

        Ok(())
    }
}

#[tauri::command]
async fn analyze_failure(
    logs: String,
    job_name: String,
    api_key: String,
) -> Result<String, String> {
    let api_key = api_key.trim().to_string();
    if api_key.is_empty() {
        return Err("MiniMax API key is missing".to_string());
    }

    let truncated = if logs.len() > 4000 {
        format!("[…前面内容省略…]\n{}", &logs[logs.len() - 4000..])
    } else {
        logs
    };

    let prompt = format!(
        r##"
你是一个资深的 CI/CD 工程师，擅长分析 GitHub Actions 失败日志。

分析以下 CI job "{}" 的失败日志，按以下固定格式回复：

【失败类型】
（从以下选择：编译错误 / 测试失败 / Lint错误 / 依赖问题 / 超时 / 权限问题 / 其他）

【根本原因】
（用 1-2 句话说明失败的根本原因）

【错误详情】
- 错误信息：...
- 发生位置：...

【修复建议】
1. ...
2. ...
3. ...

注意：
- 不要使用表格
- 不要使用 markdown 格式符号（如 ##、**、- 等）
- 用纯文本回复

日志：
```
{}
```
"##,
        job_name, truncated
    );

    let body = serde_json::json!({
        "model": "MiniMax-M2.5-highspeed",
        "max_tokens": 2048,
        "messages": [{ "role": "user", "content": prompt }]
    });

    let client = reqwest::Client::new();
    let res = client
        .post("https://api.minimaxi.com/anthropic/v1/messages")
        .header("x-api-key", &api_key)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let status = res.status();
    let body_text = res
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;

    if !status.is_success() {
        return Err(format!(
            "HTTP {}: {}",
            status.as_u16(),
            &body_text[..body_text.len().min(500)]
        ));
    }

    let data: serde_json::Value = serde_json::from_str(&body_text).map_err(|e| {
        format!(
            "JSON 解析失败: {}，原始响应: {}",
            e,
            &body_text[..body_text.len().min(200)]
        )
    })?;

    // MiniMax returns content as array: [{type: "thinking", ...}, {type: "text", text: "..."}]
    // Find the element with type == "text"
    if let Some(arr) = data["content"].as_array() {
        for item in arr {
            if item["type"].as_str() == Some("text") {
                if let Some(text) = item["text"].as_str() {
                    return Ok(text.to_string());
                }
            }
        }
    }

    // Fallback: try content[0].text (Anthropic format)
    if let Some(text) = data["content"][0]["text"].as_str() {
        return Ok(text.to_string());
    }

    // Fallback: try choices[0].message.content (OpenAI format)
    if let Some(text) = data["choices"][0]["message"]["content"].as_str() {
        return Ok(text.to_string());
    }

    // Return full JSON so we can see the actual structure
    Err(format!(
        "Unexpected response: {}",
        serde_json::to_string(&data).unwrap_or_default()
    ))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            fetch_pr_info,
            fetch_tracked_prs,
            add_tracked_pr,
            remove_tracked_pr,
            analyze_failure,
            open_cli,
            debug_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
