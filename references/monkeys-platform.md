# monkeys.im 工具接入

本 fork 的平台流程使用当前对话提供的托管工具, 供应商凭据、计费与文件存储由平台管理.  不从 shell 调用工具名, 不构造平台 HTTP 接口, 不读取密钥文件.  未启用或调用失败时报告具体原因, 不偷偷转用供应商 API.

## 生图

需要 AI 主视觉、插画、纹理或方向探针时调用 `image_generate`.  它代表 materials.md 的 T1 能力, 不需要先安装其他生图 skill 或配置 OPENAI/GEMINI key.  提示词和参数以当前工具 schema 为准, 参考图只使用工具支持的输入方式, 不套用豆包 image_gen/image_edit 参数.

保留成功结果中的真实 localPath, 确认文件已就绪再作为 HTML/PDF/视频素材使用.  若结果仍 pending, 按工具支持的状态机制等待, 不猜文件路径, 不重复生成同一素材.  没有本地路径时按平台明确支持的方式获取文件; 无法获取就说明阻塞.  素材与最终交付文件按当前工具的交付契约处理, 不重复发送已经交付的同一文件.

## 平台配音与时间轴

1. 按原格式编写解说稿, 用 `## scene-id` 分场景、`[[cue:id]]` 标视觉切换点.  先确定内容, 避免重复计费生成.
2. 运行 `node "$HD/scripts/narrate-pipeline.mjs" --script script.md --out-dir _narration`.  默认只输出 speech-plan.json, 不调用供应商、无须 --yes.  已有计划不会被覆盖, 更改稿件时用新目录.
3. 逐条读取计划 clips 的 text, 在对话中调用 `text_to_speech`.  当前工具参数可能随用户选定模型变化, 使用工具 schema 和可用的参数发现工具, 不硬编码豆包 voice ID.  同一项目保持语言、音色和速度一致.  稿件 frontmatter 的 voice/speed 不会改变已生成的音频, 应在实际工具调用时设置支持的选项.
4. 将每次成功的音频 localPath 对应文件复制到项目根目录下的素材目录.  在项目根目录写 audio-manifest.json, 仅含 clips 数组, 保留 speech-plan 的 sceneId、chunkIndex、text, 将 path 填成相对于此清单的实际本地文件路径.  不填 URL、绝对路径或猜测文件名.  路径必须位于清单目录内部, 每条生成文本必须与计划逐字一致.  失败条目先报告, 不用其他场景音频代替.
5. 运行 `node "$HD/scripts/narrate-pipeline.mjs" --script script.md --out-dir _narration --audio-manifest audio-manifest.json`.  脚本校验清单、统一音频编码、用 ffprobe 实测时长, 输出 voiceover.mp3 与 timeline.json, 不发生云调用.
6. 继续原 render-narration.sh / mix-voiceover.sh 流程.  缺 FFmpeg、Chromium 等本地依赖时明确列出阻塞, 不承诺已导出视频.  使用工具产出的声音不等于已完成最终混音与渲染.

清单例子:

```json
{"clips":[{"sceneId":"intro","chunkIndex":0,"text":"欢迎观看.","path":"audio/intro.wav"}]}
```

平台当前不保证字级时间戳.  此适配仅按各段实测音频时长定位 scene/chunk/cue, words 为 [], 不按字数伪造词级时间或声称支持卡拉 OK 高亮.  需要更细同步时在生成前把稿件拆成短句.  生成器没有返回时间戳时, 不把模型估计当成实测.

## 可选云能力边界

monkeys.im 流程不使用 scripts/cloud/tts-doubao.mjs, 不启动其 --yes/HUASHU_CLOUD_OK 凭据流程.  保留的原供应商路径仅供明确选择 --provider doubao 的原宿主用户使用, 不能作为平台工具失败的自动 fallback.

AI 视频评审不是视频生成, 当前平台流程使用抽帧和本地检查, 不默认调用火山方舟评审脚本.  HTML 中的 AI 交互原型默认 mock, 不要求用户往页面里填 key.  本 fork 不自动安装原文推荐的其他 skill, 尤其不自动引入依赖专属宿主的生图流程.
