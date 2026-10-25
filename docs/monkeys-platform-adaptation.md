# monkeys.im 托管工具适配

本 fork 保留 huashu-design 的设计流程, 将平台生图与配音接入明确写进 skill 入口和素材/动画/配音路由.  image_generate 与 text_to_speech 从当前对话工具调用, 不从 shell 直连供应商, 也不要求用户提供 API key.  原供应商脚本保留为显式旧宿主路径, 不自动 fallback.

配音默认先生成 speech-plan.json, 由 agent 对每段文本调用平台 TTS 并保存实际返回文件, 再提交 audio-manifest.json 完成本地转码、拼接和时间轴生成.  时间轴按 ffprobe 实测音频时长定位分段和 cue, 不生成伪造的字级时间戳.  --provider doubao 才进入原供应商直连模式并保留其确认门.  清单会校验完整覆盖、文本一致性、重复条目和文件路径范围, 拒绝无效音频并打印媒体工具错误细节.

验证命令: `node --test scripts/tests/platform-audio.test.mjs`.  五项测试覆盖无凭据生成计划、混合采样率音频转码与 cue 时间轴、错误清单、损坏音频和旧路径确认门.  测试输入为本地生成音频, 不调用付费生图/TTS 服务.  已通过 Node 语法检查、skill frontmatter 校验和 git diff --check.  此验证不等于所有托管模型、最终视频渲染或逐字字幕验收.

平台运行步骤见 references/monkeys-platform.md.  线上 agent 必须同时启用 image_generate 与 text_to_speech, 并引用本 fork 对应 commit 才能使用新增脚本.  未验证的 FFmpeg/HyperFrames/PPTX 等运行依赖仍应按实际环境检查.
