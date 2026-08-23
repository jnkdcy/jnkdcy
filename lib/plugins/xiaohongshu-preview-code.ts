export const XIAOHONGSHU_PREVIEW_CODE = `export default {
  manifest: {
    id: "xiaohongshu-preview",
    name: "小红书分享卡片与AI读图",
    apiVersion: 1,
    version: "1.1.0",
    author: "小坊",
    description: "发送小红书链接，自动渲染为精美分享卡片，并提取笔记标题、正文及所有配图（base64）发给 AI 供其阅读。",
    settings: [
      { key: "enableAiVision", label: "开启 AI 视觉读图", type: "boolean", default: true },
      { key: "maxImages", label: "最大发送给 AI 的图片数量", type: "number", default: 5 }
    ]
  },
  setup(ctx) {
    // 1. 注入样式
    ctx.ui.injectCSS(\`
      .xhs-preview-card {
        display: flex;
        flex-direction: column;
        background: var(--c-card-bg, #fff);
        border: 1px solid rgba(255, 36, 66, 0.15);
        border-radius: 12px;
        overflow: hidden;
        margin: 8px 0;
        width: 100%;
        max-width: 320px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        transition: all 0.2s ease-in-out;
        cursor: pointer;
        user-select: none;
      }
      .xhs-preview-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(255, 36, 66, 0.1);
        border-color: rgba(255, 36, 66, 0.3);
      }
      .xhs-cover-wrapper {
        position: relative;
        width: 100%;
        padding-bottom: 56.25%; /* 16:9 */
        background: #f1f2f3;
      }
      .xhs-cover {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .xhs-badge {
        position: absolute;
        right: 8px;
        top: 8px;
        background: rgba(0, 0, 0, 0.6);
        color: #fff;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: bold;
      }
      .xhs-content {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .xhs-title {
        font-size: 14px;
        font-weight: bold;
        color: var(--c-text-title, #111);
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .xhs-desc {
        font-size: 12px;
        color: var(--c-text-desc, #666);
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .xhs-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 4px;
        font-size: 11px;
        color: var(--c-text-muted, #999);
      }
      .xhs-author {
        display: flex;
        align-items: center;
        gap: 4px;
        font-weight: 500;
        max-width: 150px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .xhs-author-avatar {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #e1e2e3;
        object-fit: cover;
      }
      .xhs-stats {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .xhs-stat-item {
        display: flex;
        align-items: center;
        gap: 2px;
      }
      /* 骨架屏样式 */
      .xhs-skeleton {
        background: linear-gradient(90deg, #f1f2f3 25%, #e1e2e3 37%, #f1f2f3 63%);
        background-size: 400% 100%;
        animation: xhs-pulse 1.4s ease infinite;
      }
      @keyframes xhs-pulse {
        0% { background-position: 100% 50%; }
        100% { background-position: 0 50%; }
      }
      .xhs-loading-card {
        display: flex;
        flex-direction: column;
        border: 1px dashed rgba(255, 36, 66, 0.2);
        border-radius: 12px;
        padding: 12px;
        background: var(--c-card-bg, #fff);
        width: 100%;
        max-width: 320px;
        gap: 8px;
      }
      .xhs-loading-text {
        font-size: 12px;
        color: #ff2442;
        display: flex;
        align-items: center;
        gap: 6px;
      }
    \`);

    // 辅助代理网络请求，绕过跨域
    async function proxyFetch(targetUrl, options = {}) {
      const res = await ctx.system.fetch("/api/tool-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: targetUrl,
          method: options.method || "GET",
          headers: options.headers || {},
          body: options.body
        })
      });
      if (!res.ok) {
        throw new Error("HTTP " + res.status);
      }
      const contentType = res.headers.get("Content-Type") || "";
      if (contentType.includes("application/json")) {
        return res.json();
      }
      return res.text();
    }

    // 抓取小红书笔记数据
    async function fetchNoteData(url) {
      let html;
      try {
        html = await proxyFetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
          }
        });
      } catch (e) {
        ctx.system.log("抓取小红书页面失败", e);
        throw new Error("小红书页面抓取失败，请检查网络或链接是否有效");
      }

      let stateJson = null;
      const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.+?\});?/s)
        || html.match(/<script>\s*window\.__INITIAL_STATE__\s*=\s*(\{.+?\})\s*<\/script>/s);

      if (stateMatch) {
        try {
          const cleanJson = stateMatch[1].replace(/\\\\u002F/g, "/");
          stateJson = JSON.parse(cleanJson);
        } catch (e) {
          ctx.system.log("解析 __INITIAL_STATE__ 失败", e);
        }
      }

      let noteData = null;
      if (stateJson) {
        noteData = stateJson.noteData?.data?.noteData 
          || stateJson.noteData?.normalNotePreloadData
          || (stateJson.note?.noteDetailMap ? stateJson.note.noteDetailMap[Object.keys(stateJson.note.noteDetailMap)[0]]?.note : null)
          || stateJson.note?.note;
      }

      if (!noteData) {
        // 正则兜底解析
        const titleMatch = html.match(/<meta property="og:title" content="(.*?)"/i)
          || html.match(/<title>(.*?)<\/title>/i);
        const descMatch = html.match(/<meta name="description" content="(.*?)"/i)
          || html.match(/<meta property="og:description" content="(.*?)"/i);
        const authorMatch = html.match(/<meta property="og:author" content="(.*?)"/i);

        const imgUrls = [];
        const imgReg = /https?:\/\/ci\.xiaohongshu\.com\/[a-zA-Z0-9_-]+/g;
        let m;
        while ((m = imgReg.exec(html)) !== null) {
          if (!imgUrls.includes(m[0])) imgUrls.push(m[0]);
        }

        if (titleMatch || descMatch) {
          return {
            title: titleMatch ? titleMatch[1].trim() : "小红书分享",
            desc: descMatch ? descMatch[1].trim() : "",
            author: authorMatch ? authorMatch[1].trim() : "小红书用户",
            images: imgUrls.slice(0, 9),
            likes: 0,
            comments: 0
          };
        }

        throw new Error("未能解析出小红书笔记数据，可能触发了验证码或链接已失效");
      }

      const title = noteData.title || "";
      const desc = noteData.desc || "";
      const author = noteData.author?.nickname || noteData.user?.nickname || "小红书用户";
      const authorAvatar = noteData.author?.avatar || noteData.user?.avatar || "";

      const images = [];
      if (Array.isArray(noteData.imageList)) {
        noteData.imageList.forEach(img => {
          let u = img.urlDefault || img.urlPre || img.url || "";
          if (u) {
            if (u.startsWith("//")) u = "https:" + u;
            u = u.replace(/\\\\u002F/g, "/");
            if (!images.includes(u)) images.push(u);
          }
        });
      }

      return {
        title,
        desc,
        author,
        authorAvatar,
        images,
        likes: noteData.interactInfo?.likedCount || 0,
        comments: noteData.interactInfo?.commentCount || 0,
        collected: noteData.interactInfo?.collectedCount || 0
      };
    }

    // 2. 拦截并处理用户发来的消息
    const XHS_REGEX = /https?:\/\/(?:www\.)?xiaohongshu\.com\/(?:discovery\/item|explore)\/[a-zA-Z0-9_]+|https?:\/\/xhslink\.(?:com|cn)\/(?:[a-zA-Z0-9_]+\/)*[a-zA-Z0-9_]+/i;

    ctx.hooks.transform("user.beforeSend", (payload) => {
      const text = payload.text;
      const match = text.match(XHS_REGEX);

      // 加载中拦截保护
      const messages = ctx.data.messages.list(payload.sessionId);
      const hasLoading = messages.some(m => m.mediaType === "plugin:xhs-card" && m.mediaData?.status === "loading");
      if (hasLoading) {
        ctx.ui.toast("📕 内容还在加载中，稍等一下就好～");
        payload.cancelled = true;
        return payload;
      }

      if (!match) return payload;

      const matchedUrl = match[0];
      payload.cancelled = true; // 拦截原生发送，转为自定义卡片发送

      // 提取前后的文字，避免丢弃用户想发给AI的其他话
      const extraText = text.replace(matchedUrl, "").trim();
      const contentText = "[小红书链接预览] " + matchedUrl + (extraText ? "\n" + extraText : "");

      // 预先插入 loading 自定义卡片消息
      const newMsg = ctx.data.messages.push({
        sessionId: payload.sessionId,
        role: "user",
        content: contentText,
        mediaType: "plugin:xhs-card",
        mediaData: {
          status: "loading",
          progress: "📕 正在解析小红书链接...",
          url: matchedUrl
        }
      });

      // 异步抓取数据
      (async () => {
        try {
          ctx.data.variables.set("xhs_loading_" + newMsg.id, true, "session", payload.sessionId);
          
          // 抓取网页
          const note = await fetchNoteData(matchedUrl);
          
          // 开始抓取配图二进制
          const base64Images = [];
          const enableVision = ctx.system.settings.get("enableAiVision") !== false;
          const maxImages = Number(ctx.system.settings.get("maxImages")) || 5;

          if (enableVision && note.images && note.images.length > 0) {
            const limit = Math.min(note.images.length, maxImages);
            for (let i = 0; i < limit; i++) {
              ctx.data.messages.update(newMsg.id, {
                mediaData: {
                  status: "loading",
                  progress: "正在下载图片 (" + (i + 1) + "/" + limit + ")...",
                  url: matchedUrl
                }
              });

              try {
                const imgRes = await proxyFetch(note.images[i], {
                  headers: {
                    "Referer": "https://www.xiaohongshu.com/"
                  }
                });
                if (imgRes && imgRes.data) {
                  base64Images.push({
                    base64: imgRes.data,
                    mime: imgRes.contentType || "image/jpeg"
                  });
                }
              } catch (e) {
                ctx.system.log("下载配图失败: " + note.images[i], e);
              }
            }
          }

          // 抓取完成，更新为 loaded 状态
          ctx.data.messages.update(newMsg.id, {
            status: "sent",
            mediaData: {
              status: "loaded",
              url: matchedUrl,
              note: {
                title: note.title,
                desc: note.desc,
                author: note.author,
                authorAvatar: note.authorAvatar,
                cover: note.images?.[0] || "",
                imageCount: note.images?.length || 0,
                likes: note.likes,
                comments: note.comments,
                collected: note.collected
              },
              images: base64Images
            }
          });
        } catch (err) {
          ctx.system.log("解析小红书卡片失败", err);
          ctx.data.messages.update(newMsg.id, {
            status: "failed",
            mediaData: {
              status: "error",
              url: matchedUrl,
              error: err.message || "请求超时或遭遇风控"
            }
          });
        } finally {
          ctx.data.variables.unset("xhs_loading_" + newMsg.id, "session", payload.sessionId);
        }
      })();

      return payload;
    });

    // 3. 注册卡片消息的渲染器
    ctx.ui.messageKind("xhs-card", (el, msg) => {
      const data = msg.mediaData || {};
      
      if (data.status === "loading") {
        el.innerHTML = \`
          <div class="xhs-loading-card">
            <div class="xhs-loading-text">
              <span>📕</span>
              <span>\${data.progress || "正在读取笔记..."}</span>
            </div>
            <div class="xhs-skeleton" style="height: 12px; width: 85%; border-radius: 4px;"></div>
            <div class="xhs-skeleton" style="height: 12px; width: 60%; border-radius: 4px;"></div>
          </div>
        \`;
        return;
      }
      
      if (data.status === "error") {
        el.innerHTML = \`
          <div class="xhs-loading-card" style="border-color: var(--c-danger, #ef4444);">
            <div class="xhs-loading-text" style="color: var(--c-danger, #ef4444);">
              <span>❌ 读取小红书失败</span>
            </div>
            <div style="font-size: 11px; color: var(--c-text-desc, #666); opacity: 0.8; word-break: break-all; margin-bottom: 4px;">
              \${data.error || "数据解析异常"}
            </div>
            <a href="\${data.url}" target="_blank" style="font-size: 11px; color: #ff2442; text-decoration: underline;">
              打开原网页链接
            </a>
          </div>
        \`;
        return;
      }
      
      const note = data.note || {};
      const coverUrl = note.cover || "";
      const imageCount = note.imageCount || 0;
      
      el.innerHTML = \`
        <div class="xhs-preview-card">
          \${coverUrl ? \`
            <div class="xhs-cover-wrapper">
              <img class="xhs-cover" src="\${coverUrl}" alt="cover" loading="lazy" />
              \${imageCount > 1 ? \`<span class="xhs-badge">🖼️ \${imageCount}</span>\` : ""}
            </div>
          \` : ""}
          <div class="xhs-content">
            <div class="xhs-title">\${note.title || "小红书笔记"}</div>
            \${note.desc ? \`<div class="xhs-desc">\${note.desc}</div>\` : ""}
            <div class="xhs-footer">
              <div class="xhs-author">
                \${note.authorAvatar ? \`<img class="xhs-author-avatar" src="\${note.authorAvatar}" />\` : "📕"}
                <span>\${note.author || "小红书用户"}</span>
              </div>
              <div class="xhs-stats">
                <span class="xhs-stat-item">❤️ \${note.likes || 0}</span>
                <span class="xhs-stat-item">💬 \${note.comments || 0}</span>
              </div>
            </div>
          </div>
        </div>
      \`;
      
      const cardEl = el.querySelector(".xhs-preview-card");
      if (cardEl && data.url) {
        cardEl.addEventListener("click", () => {
          window.open(data.url, "_blank");
        });
      }
    });

    // 4. 重写 LLM 发送的消息，实现 AI 读图
    ctx.hooks.transform("llm.request", (payload) => {
      const messages = payload.messages;
      const sessionId = payload.sessionId;
      if (!messages || !sessionId) return payload;

      // 遍历寻找 user 消息
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.role !== "user" || typeof msg.content !== "string") continue;

        // 根据我们标志性的字符串识别小红书预览卡片
        if (msg.content.includes("[小红书链接预览] ")) {
          const lines = msg.content.split("\n");
          const firstLine = lines[0];
          const matchedUrl = firstLine.replace("[小红书链接预览] ", "").trim();
          const extraText = lines.slice(1).join("\n").trim();
          
          // 从消息列表里寻找对应的 loaded 卡片数据
          const chatMsgs = ctx.data.messages.list(sessionId);
          const targetMsg = chatMsgs.find(m => m.mediaType === "plugin:xhs-card" && m.mediaData?.url === matchedUrl);
          
          if (targetMsg && targetMsg.mediaData?.status === "loaded") {
            const data = targetMsg.mediaData;
            const note = data.note || {};
            const enableVision = ctx.system.settings.get("enableAiVision") !== false;

            const textContent = (extraText ? extraText + "\\n\\n" : "") +
              "[用户分享的小红书笔记]\\n" +
              "标题: " + (note.title || "无标题") + "\\n" +
              "作者: " + (note.author || "未知") + "\\n" +
              "正文内容: " + (note.desc || "无内容") + "\\n" +
              "数据: 点赞数 " + (note.likes || 0) + ", 评论数 " + (note.comments || 0) + (note.collected ? ", 收藏数 " + note.collected : "") + "\\n" +
              "原链接: " + data.url;

            const contentParts = [
              { type: "text", text: textContent }
            ];

            if (enableVision && data.images && data.images.length > 0) {
              data.images.forEach(img => {
                if (img.base64) {
                  contentParts.push({
                    type: "image_url",
                    image_url: {
                      url: "data:" + (img.mime || "image/jpeg") + ";base64," + img.base64,
                      detail: "low"
                    }
                  });
                }
              });
            }

            msg.content = contentParts;
          }
        }
      }

      return payload;
    });
  }
};`;
