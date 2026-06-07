# FFmpeg for Windows — 下载说明

本项目需要 `ffmpeg.exe` 和 `ffprobe.exe` 用于音频波形提取和格式转换。

## 下载方式

1. 访问 https://github.com/BtbN/FFmpeg-Builds/releases
2. 下载 `ffmpeg-master-latest-win64-gpl.zip`
3. 解压后，从 `bin/` 目录中取出：
   - `ffmpeg.exe`
   - `ffprobe.exe`
4. 将这两个文件放到本目录（`backend/`）下

## 验证

```cmd
cd backend
ffmpeg.exe -version
ffprobe.exe -version
```

两个命令都应正常输出版本信息。

## 注意事项

- 这两个文件不包含在 Git 仓库中（已在 .gitignore 排除）
- PyInstaller 打包时会自动将它们打入 `_internal/` ��录
- 如果没有这两个文件，应用仍可运行，但波形提取可能失败（fallback 使用 soundfile）
