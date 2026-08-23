export default {
  manifest: {
    id: "xiaohongshu-preview",
    name: "小红书分享卡片与AI读图",
    apiVersion: 1,
    version: "1.5.0",
    author: "小坊",
    description: "发送小红书链接，自动渲染为精美外部卡片，并提取笔记标题、正文、图片base64及前5条评论给 AI 供其阅读。支持普通链接及 xhslink.com / xhslink.cn 短链接。",
    settings: [
      { key: "enableAiVision", label: "开启 AI 视觉读图", type: "boolean", default: true },
      { key: "maxImages", label: "最大发送给 AI 的图片数量", type: "number", default: 5 }
    ]
  },
  setup(ctx) {
    // 1. 注入卡片样式，并强行穿透擦除宿主气泡底色与边距
    ctx.ui.injectCSS(
      ".bubble:has(.xhs-preview-card), .bubble:has(.xhs-loading-card), .bubble-text:has(.xhs-preview-card), .bubble-text:has(.xhs-loading-card) { " +
        "background: transparent !important; " +
        "border: none !important; " +
        "box-shadow: none !important; " +
        "padding: 0 !important; " +
        "max-width: 100% !important; " +
      "} " +
      ".xhs-preview-card { " +
        "display: flex; " +
        "flex-direction: column; " +
        "background: var(--c-card-bg, #fff); " +
        "border: 1px solid rgba(255, 36, 66, 0.15); " +
        "border-radius: 12px; " +
        "overflow: hidden; " +
        "margin: 8px 0; " +
        "width: 100%; " +
        "max-width: 300px; " +
        "box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); " +
        "transition: all 0.2s ease-in-out; " +
        "cursor: pointer; " +
        "user-select: none; " +
      "} " +
      ".xhs-preview-card:hover { " +
        "transform: translateY(-2px); " +
        "box-shadow: 0 6px 16px rgba(255, 36, 66, 0.1); " +
        "border-color: rgba(255, 36, 66, 0.3); " +
      "} " +
      ".xhs-cover-wrapper { " +
        "position: relative; " +
        "width: 100%; " +
        "padding-bottom: 56.25%; " +
        "background: #f1f2f3; " +
      "} " +
      ".xhs-cover { " +
        "position: absolute; " +
        "top: 0; " +
        "left: 0; " +
        "width: 100%; " +
        "height: 100%; " +
        "object-fit: cover; " +
      "} " +
      ".xhs-badge { " +
        "position: absolute; " +
        "right: 8px; " +
        "top: 8px; " +
        "background: rgba(0, 0, 0, 0.6); " +
        "color: #fff; " +
        "padding: 2px 6px; " +
        "border-radius: 4px; " +
        "font-size: 10px; " +
        "font-weight: bold; " +
      "} " +
      ".xhs-content { " +
        "padding: 12px; " +
        "display: flex; " +
        "flex-direction: column; " +
        "gap: 6px; " +
      "} " +
      ".xhs-title { " +
        "font-size: 14px; " +
        "font-weight: bold; " +
        "color: var(--c-text-title, #111); " +
        "line-height: 1.4; " +
        "display: -webkit-box; " +
        "-webkit-line-clamp: 2; " +
        "-webkit-box-orient: vertical; " +
        "overflow: hidden; " +
      "} " +
      ".xhs-desc { " +
        "font-size: 12px; " +
        "color: var(--c-text-desc, #666); " +
        "line-height: 1.5; " +
        "display: -webkit-box; " +
        "-webkit-line-clamp: 3; " +
        "-webkit-box-orient: vertical; " +
        "overflow: hidden; " +
      "} " +
      ".xhs-footer { " +
        "display: flex; " +
        "justify-content: space-between; " +
        "align-items: center; " +
        "margin-top: 4px; " +
        "font-size: 11px; " +
        "color: var(--c-text-muted, #999); " +
      "} " +
      ".xhs-author { " +
        "display: flex; " +
        "align-items: center; " +
        "gap: 4px; " +
        "font-weight: 500; " +
        "max-width: 130px; " +
        "white-space: nowrap; " +
        "overflow: hidden; " +
        "text-overflow: ellipsis; " +
      "} " +
      ".xhs-author-avatar { " +
        "width: 16px; " +
        "height: 16px; " +
        "border-radius: 50%; " +
        "background: #e1e2e3; " +
        "object-fit: cover; " +
      "} " +
      ".xhs-stats { " +
        "display: flex; " +
        "align-items: center; " +
        "gap: 8px; " +
      "} " +
      ".xhs-stat-item { " +
        "display: flex; " +
        "align-items: center; " +
        "gap: 2px; " +
      "} " +
      ".xhs-skeleton { " +
        "background: linear-gradient(90deg, #f1f2f3 25%, #e1e2e3 37%, #f1f2f3 63%); " +
        "background-size: 400% 100%; " +
        "animation: xhs-pulse 1.4s ease infinite; " +
      "} " +
      "@keyframes xhs-pulse { " +
        "0% { background-position: 100% 50%; } " +
        "100% { background-position: 0 50%; } " +
      "} " +
      ".xhs-loading-card { " +
        "display: flex; " +
        "flex-direction: column; " +
        "border: 1px dashed rgba(255, 36, 66, 0.2); " +
        "border-radius: 12px; " +
        "padding: 12px; " +
        "background: var(--c-card-bg, #fff); " +
        "width: 100%; " +
        "max-width: 300px; " +
        "gap: 8px; " +
      "} " +
      ".xhs-loading-text { " +
        "font-size: 12px; " +
        "color: #ff2442; " +
        "display: flex; " +
        "align-items: center; " +
        "gap: 6px; " +
      "}"
    );

    // 辅助代理网络请求，绕过跨域
    async function proxyFetch(targetUrl, options) {
      var res = await ctx.system.fetch("/api/tool-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: targetUrl,
          method: (options && options.method) || "GET",
          headers: (options && options.headers) || {},
          body: (options && options.body) || undefined
        })
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      var contentType = res.headers.get("Content-Type") || "";
      if (contentType.indexOf("application/json") >= 0) {
        return res.json();
      }
      return res.text();
    }

    // 抓取小红书笔记数据
    async function fetchNoteData(url) {
      var html = "";
      try {
        html = await proxyFetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        });
      } catch (e) {
        ctx.system.log("抓取网页失败", e);
        throw new Error("小红书页面抓取失败，请检查网络或链接是否有效");
      }

      var title = "小红书笔记";
      var desc = "";
      var author = "小红书用户";
      var authorAvatar = "";
      var images = [];
      var likes = 0;
      var commentsCount = 0;
      var collected = 0;
      var commentsList = [];

      // 1. 优先使用元数据 Meta 标签（桌面版网页极度稳定）
      var titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i)
        || html.match(/<meta\s+name=["']twitter:title["']\s+content=["'](.*?)["']/i)
        || html.match(/<title>(.*?)<\/title>/i);
      if (titleMatch) title = titleMatch[1].trim();

      var descMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i)
        || html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i);
      if (descMatch) desc = descMatch[1].trim();

      var authorMatch = html.match(/<meta\s+property=["']og:author["']\s+content=["'](.*?)["']/i)
        || html.match(/<meta\s+name=["']author["']\s+content=["'](.*?)["']/i);
      if (authorMatch) author = authorMatch[1].trim();

      var coverMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i);
      if (coverMatch) images.push(coverMatch[1]);

      // 2. 尝试提取 INITIAL_STATE
      var stateJson = null;
      var stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});?/i)
        || html.match(/<script>\s*window\.__INITIAL_STATE__\s*=\s*({.+?})\s*<\/script>/i);

      if (stateMatch) {
        try {
          var cleanJson = stateMatch[1].replace(/\\u002F/g, "/");
          stateJson = JSON.parse(cleanJson);
        } catch (e) {
          ctx.system.log("解析 __INITIAL_STATE__ 失败", e);
        }
      }

      var noteData = null;
      if (stateJson) {
        try {
          var nd = stateJson.noteData || stateJson.note;
          noteData = (nd && nd.data && nd.data.noteData) 
            || (nd && nd.normalNotePreloadData)
            || (stateJson.note && stateJson.note.noteDetailMap && stateJson.note.noteDetailMap[Object.keys(stateJson.note.noteDetailMap)[0]] && stateJson.note.noteDetailMap[Object.keys(stateJson.note.noteDetailMap)[0]].note)
            || (stateJson.note && stateJson.note.note)
            || nd;
        } catch (e) {}
      }

      if (noteData) {
        if (noteData.title) title = noteData.title;
        if (noteData.desc) desc = noteData.desc;
        
        var u = noteData.author || noteData.user;
        if (u && u.nickname) author = u.nickname;
        if (u && u.avatar) authorAvatar = u.avatar;

        if (Array.isArray(noteData.imageList)) {
          noteData.imageList.forEach(function(img) {
            var imgUrl = img.urlDefault || img.urlPre || img.url || "";
            if (imgUrl) {
              if (imgUrl.indexOf("//") === 0) imgUrl = "https:" + imgUrl;
              imgUrl = imgUrl.replace(/\\u002F/g, "/");
              if (images.indexOf(imgUrl) < 0) images.push(imgUrl);
            }
          });
        }

        var interact = noteData.interactInfo || {};
        likes = interact.likedCount || interact.likes || likes;
        commentsCount = interact.commentCount || interact.comments || commentsCount;
        collected = interact.collectedCount || interact.collected || collected;

        // 加载评论
        var rawComments = [];
        try {
          var commentData = stateJson.comment || {};
          rawComments = commentData.comments || [];
          if (!rawComments.length && noteData.comments) {
            rawComments = noteData.comments;
          }
        } catch(e) {}
        if (rawComments && Array.isArray(rawComments)) {
          commentsList = rawComments.slice(0, 5).map(function(c) {
            return {
              author: (c.user && c.user.nickname) || "匿名用户",
              content: c.content || ""
            };
          });
        }
      }

      // 3. 正则扫描兜底（如果上面没有匹配出昵称、点赞数和评论数）
      if (!likes) {
        var likesMatch = html.match(/"likedCount"\s*:\s*"?(\d+)"?/i) || html.match(/likedCount\s*:\s*"?(\d+)"?/i);
        if (likesMatch) likes = parseInt(likesMatch[1]);
      }
      if (!commentsCount) {
        var commentsMatch = html.match(/"commentCount"\s*:\s*"?(\d+)"?/i) || html.match(/commentCount\s*:\s*"?(\d+)"?/i);
        if (commentsMatch) commentsCount = parseInt(commentsMatch[1]);
      }
      if (author === "小红书用户") {
        var nicknameMatch = html.match(/class=["']nickname["']>([^<]+)</i)
          || html.match(/class=["']user-name["']>([^<]+)</i)
          || html.match(/"nickname"\s*:\s*"([^"]+)"/i);
        if (nicknameMatch) author = nicknameMatch[1];
      }

      // 4. 正则扫描兜底提取前五条评论
      if (commentsList.length === 0) {
        var commentReg = /\{"content":"([^"]+)","id":[^,]+,"user":\{"nickname":"([^"]+)"/g;
        var cm;
        while ((cm = commentReg.exec(html)) !== null && commentsList.length < 5) {
          commentsList.push({
            author: cm[2],
            content: cm[1]
          });
        }
      }

      // 兜底抓取其他配图
      if (images.length === 0) {
        var imgReg = /https?:\/\/ci\.xiaohongshu\.com\/[a-zA-Z0-9_-]+/g;
        var m;
        while ((m = imgReg.exec(html)) !== null) {
          if (images.indexOf(m[0]) < 0) images.push(m[0]);
        }
      }

      return {
        title: title,
        desc: desc,
        author: author,
        authorAvatar: authorAvatar,
        images: images,
        likes: likes,
        comments: commentsCount,
        collected: collected,
        commentsList: commentsList,
        noteUrl: url
      };
    }

    // 2. 拦截发送
    var XHS_REGEX = /https?:\/\/(?:www\.)?xiaohongshu\.com\/(?:discovery\/item|explore)\/[a-zA-Z0-9_]+|https?:\/\/xhslink\.(?:com|cn)\/(?:[a-zA-Z0-9_]+\/)*[a-zA-Z0-9_]+/i;

    ctx.hooks.transform("user.beforeSend", function(payload) {
      var text = payload.text;
      var match = text.match(XHS_REGEX);
      var messages = ctx.data.messages.list(payload.sessionId);
      var hasLoading = messages.some(function(m) {
        return m.mediaType === "plugin:xhs-card" && m.mediaData && m.mediaData.status === "loading";
      });
      if (hasLoading) {
        ctx.ui.toast("📕 内容还在加载中，稍等一下就好～");
        payload.cancelled = true;
        return payload;
      }
      if (!match) return payload;

      var matchedUrl = match[0];
      payload.cancelled = true;

      var extraText = text.replace(matchedUrl, "").trim();
      var contentText = "[小红书链接预览] " + matchedUrl + (extraText ? "\n" + extraText : "");

      var newMsg = ctx.data.messages.push({
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

      // 异步加载
      (async function() {
        try {
          ctx.data.variables.set("xhs_loading_" + newMsg.id, true, "session", payload.sessionId);
          var note = await fetchNoteData(matchedUrl);
          
          ctx.data.messages.update(newMsg.id, {
            mediaData: {
              status: "loading",
              progress: "正在获取笔记配图...",
              url: matchedUrl
            }
          });

          var base64Images = [];
          var enableVision = ctx.system.settings.get("enableAiVision") !== false;
          var maxImages = Number(ctx.system.settings.get("maxImages")) || 5;

          if (enableVision && note.images && note.images.length > 0) {
            var limit = Math.min(note.images.length, maxImages);
            var promises = [];
            // 并发下载图片，大幅缩短耗时
            for (var i = 0; i < limit; i++) {
              promises.push(
                (async function(idx) {
                  try {
                    var imgRes = await proxyFetch(note.images[idx], {
                      headers: { "Referer": "https://www.xiaohongshu.com/" }
                    });
                    if (imgRes && imgRes.data) {
                      return {
                        index: idx,
                        base64: imgRes.data,
                        mime: imgRes.contentType || "image/jpeg"
                      };
                    }
                  } catch (e) {
                    ctx.system.log("下载配图失败: " + note.images[idx], e);
                  }
                  return null;
                })(i)
              );
            }
            var results = await Promise.all(promises);
            base64Images = results.filter(Boolean).sort(function(a, b) { return a.index - b.index; });
          }

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
                cover: note.images[0] || "",
                imageCount: note.images.length || 0,
                likes: note.likes,
                comments: note.comments,
                collected: note.collected,
                commentsList: note.commentsList
              },
              images: base64Images
            }
          });
        } catch (err) {
          ctx.system.log("解析卡片失败", err);
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

    // 3. UI 渲染器
    ctx.ui.messageKind("xhs-card", function(el, msg) {
      var data = msg.mediaData || {};
      if (data.status === "loading") {
        el.innerHTML = "<div class='xhs-loading-card'>" +
          "<div class='xhs-loading-text'><span>📕</span><span>" + (data.progress || "正在读取笔记...") + "</span></div>" +
          "<div class='xhs-skeleton' style='height: 12px; width: 85%; border-radius: 4px;'></div>" +
          "<div class='xhs-skeleton' style='height: 12px; width: 60%; border-radius: 4px;'></div>" +
          "</div>";
        return;
      }
      if (data.status === "error") {
        el.innerHTML = "<div class='xhs-loading-card' style='border-color: var(--c-danger, #ef4444);'>" +
          "<div class='xhs-loading-text' style='color: var(--c-danger, #ef4444);'><span>❌ 读取小红书失败</span></div>" +
          "<div style='font-size: 11px; color: var(--c-text-desc, #666); opacity: 0.8; word-break: break-all; margin-bottom: 4px;'>" + (data.error || "数据解析异常") + "</div>" +
          "<a href='" + data.url + "' target='_blank' style='font-size: 11px; color: #ff2442; text-decoration: underline;'>打开原网页链接</a>" +
          "</div>";
        return;
      }
      var note = data.note || {};
      var coverUrl = note.cover || "";
      var imageCount = note.imageCount || 0;
      var coverHtml = coverUrl ? 
        "<div class='xhs-cover-wrapper'>" +
          "<img class='xhs-cover' src='" + coverUrl + "' alt='cover' loading='lazy' />" +
          (imageCount > 1 ? "<span class='xhs-badge'>🖼️ " + imageCount + "</span>" : "") +
        "</div>" : "";
      var authorAvatarHtml = note.authorAvatar ? 
        "<img class='xhs-author-avatar' src='" + note.authorAvatar + "' />" : "📕";
      var descHtml = note.desc ? 
        "<div class='xhs-desc'>" + note.desc + "</div>" : "";
      
      el.innerHTML = "<div class='xhs-preview-card'>" +
        coverHtml +
        "<div class='xhs-content'>" +
          "<div class='xhs-title'>" + (note.title || "小红书笔记") + "</div>" +
          descHtml +
          "<div class='xhs-footer'>" +
            "<div class='xhs-author'>" +
              authorAvatarHtml +
              "<span>" + (note.author || "小红书用户") + "</span>" +
            "</div>" +
            "<div class='xhs-stats'>" +
              "<span class='xhs-stat-item'>❤️ " + (note.likes || 0) + "</span>" +
              "<span class='xhs-stat-item'>💬 " + (note.comments || 0) + "</span>" +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>";

      var cardEl = el.querySelector(".xhs-preview-card");
      if (cardEl && data.url) {
        cardEl.addEventListener("click", function() {
          window.open(data.url, "_blank");
        });
      }
    });

    // 4. 重写大模型请求
    ctx.hooks.transform("llm.request", function(payload) {
      var messages = payload.messages;
      var sessionId = payload.sessionId;
      if (!messages || !sessionId) return payload;
      for (var i = 0; i < messages.length; i++) {
        var msg = messages[i];
        if (msg.role !== "user" || typeof msg.content !== "string") continue;
        if (msg.content.indexOf("[小红书链接预览] ") >= 0) {
          var lines = msg.content.split("\n");
          var firstLine = lines[0];
          var matchedUrl = firstLine.replace("[小红书链接预览] ", "").trim();
          var extraText = lines.slice(1).join("\n").trim();
          var chatMsgs = ctx.data.messages.list(sessionId);
          var targetMsg = null;
          for (var j = 0; j < chatMsgs.length; j++) {
            if (chatMsgs[j].mediaType === "plugin:xhs-card" && chatMsgs[j].mediaData && chatMsgs[j].mediaData.url === matchedUrl) {
              targetMsg = chatMsgs[j];
              break;
            }
          }
          if (targetMsg && targetMsg.mediaData && targetMsg.mediaData.status === "loaded") {
            var d = targetMsg.mediaData;
            var n = d.note || {};
            var enableVision = ctx.system.settings.get("enableAiVision") !== false;
            
            var commentLines = [];
            if (n.commentsList && n.commentsList.length > 0) {
              n.commentsList.forEach(function(c, index) {
                commentLines.push((index + 1) + ". " + c.author + ": " + c.content);
              });
            }

            var txt = (extraText ? extraText + "\n\n" : "") + 
              "[用户分享的小红书笔记]\n标题: " + (n.title || "无标题") + 
              "\n作者: " + (n.author || "未知") + 
              "\n正文内容: " + (n.desc || "无内容") + 
              "\n数据: 点赞数 " + (n.likes || 0) + ", 评论数 " + (n.comments || 0) + (n.collected ? ", 收藏数 " + n.collected : "") + 
              "\n原链接: " + d.url +
              (commentLines.length > 0 ? "\n\n[精选前5条评论]\n" + commentLines.join("\n") : "");

            var parts = [{ type: "text", text: txt }];
            if (enableVision && d.images && d.images.length > 0) {
              d.images.forEach(function(img) {
                if (img.base64) {
                  parts.push({ type: "image_url", image_url: { url: "data:" + (img.mime || "image/jpeg") + ";base64," + img.base64, detail: "low" } });
                }
              });
            }
            msg.content = parts;
          }
        }
      }
      return payload;
    });
  }
};