#!/usr/bin/env python3
"""
Facebook Auto-Post v3 — Built from dialog-aware recording analysis.

Recording: rec_1773150158620 (20 steps, 79.6s)
Key findings:
- All actions target dialog[0] (always titled "Tạo bài viết")
- dialog[1] = inactive mirror (no buttons, z=auto)
- dialog[2] = WhatsApp popup (appears after Đăng, click "Lúc khác")
- Dialog is a carousel — buttons change per screen:
    Composer: "Công khai", "Thêm vào bài viết", "Tiếp"
    Reels Editor: "Thu ngắn video", "Phụ đề", "Tối ưu hóa"
    Publish: "Lưu", "Đăng"

DNA selectors from recording:
  Step 1: page:span:Bạn đang nghĩ gì?
  Step 3: dialog[0]:p: (caption editor)
  Step 4: dialog[0]:img: (photo/video icon 24x24)
  Step 5: dialog[0]:file: (input[type="file"])
  Step 8: dialog[0]:div:Tiếp (1st Tiếp)
  Step 9: dialog[0]:text:Tiêu đề thước phim (reel title input)
  Step 12: dialog[0]:span:Tiếp (2nd Tiếp)
  Step 14: dialog[0]:span:Đăng (publish)
  Step 15: dialog[2]:span:Lúc khác (dismiss WhatsApp popup)
"""
import sys, os, json, time, base64, argparse
from datetime import datetime

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hand_agent import HandAgent


def fb_post(video_path, page_id, caption="", reel_title="", schedule_time=None):
    """Post a video to a Facebook Page using DOM automation."""
    if not os.path.exists(video_path):
        print(f"❌ File không tồn tại: {video_path}"); return False

    agent = HandAgent()
    action_lib = {}
    DLG = '[role="dialog"]'

    # ── Helper functions ──────────────────────────────────
    def js(code):
        return agent._send_command("hand_execute_js", {"code": code})

    def wait(sec, msg=""):
        if msg: print(f"    ⏳ {msg} ({sec}s)")
        time.sleep(sec)

    def click_at(x, y, desc=""):
        """Click at normalized viewport coordinates using hand_execute_action."""
        r = agent._send_command("hand_execute_action", {"action": "click", "x": x, "y": y})
        ok = r.get('success', False)
        if desc: print(f"    {'✅' if ok else '❌'} [{desc}] click({x:.3f}, {y:.3f})")
        return ok

    def find_and_click(text, dlg_index=0, desc=""):
        """Find visible text/button in dialog[dlg_index] and click at its center.
        
        For multi-dialog, finds the correct dialog by index, then searches 
        for text in visible buttons and spans within viewport bounds.
        """
        esc = text.replace("'", "\\\\'")
        r = js(f"""(function(){{
            var dlgs = document.querySelectorAll('{DLG}');
            if (dlgs.length <= {dlg_index}) return JSON.stringify({{error: 'NO_DIALOG_{dlg_index}', count: dlgs.length}});
            var dlg = dlgs[{dlg_index}];
            var vw = window.innerWidth, vh = window.innerHeight;
            function iv(e) {{
                if (!e || e.offsetParent === null) return false;
                var r = e.getBoundingClientRect();
                return r.left >= -5 && r.right <= vw + 5 && r.top >= 0 && r.bottom <= vh + 5 && r.width > 0;
            }}
            function gc(e) {{
                var r = e.getBoundingClientRect();
                return {{x: (r.left + r.width/2)/vw, y: (r.top + r.height/2)/vh, t: e.textContent.trim().substring(0,20), tag: e.tagName}};
            }}
            // Search: role=button with aria-label, role=button with text, span, div with text
            var selectors = ['[role="button"][aria-label="'+'{esc}'+'"', '[role="button"]', 'span', 'div'];
            for (var sel of selectors) {{
                var els = dlg.querySelectorAll(sel);
                for (var e of els) {{
                    if (iv(e) && e.textContent.trim() === '{esc}') {{
                        return JSON.stringify({{found: sel, ...gc(e)}});
                    }}
                }}
            }}
            // Broad: any child containing exact text
            var all = dlg.querySelectorAll('*');
            for (var e of all) {{
                if (iv(e) && e.childElementCount === 0 && e.textContent.trim() === '{esc}') {{
                    return JSON.stringify({{found: 'leaf', ...gc(e)}});
                }}
            }}
            return JSON.stringify({{error: 'NOT_FOUND', text: '{esc}'}});
        }})()""")
        try:
            data = json.loads(r.get('result', '{}'))
        except:
            data = {"error": "PARSE_FAIL"}

        if 'error' in data:
            print(f"    ❌ [{desc or text}] in dialog[{dlg_index}]: {data['error']}")
            return False

        x, y = data['x'], data['y']
        print(f"    📍 [{desc or text}] found {data.get('found','')} <{data.get('tag','')}>'{data.get('t','')}' at ({x:.3f},{y:.3f})")
        return click_at(x, y, desc or text)

    def capture_env(label=""):
        """Capture full environment: dialogs, visible buttons, url."""
        r = js(f"""(function(){{
            var out = {{url: location.href.substring(0,60)}};
            var dlgs = document.querySelectorAll('{DLG}');
            var vw = window.innerWidth, vh = window.innerHeight;
            function iv(e) {{
                if (!e || e.offsetParent === null) return false;
                var r = e.getBoundingClientRect();
                return r.left >= -5 && r.right <= vw + 5 && r.top >= 0 && r.bottom <= vh + 5 && r.width > 0;
            }}
            out.dlgCount = dlgs.length;
            out.dlgs = [];
            for (var i = 0; i < dlgs.length; i++) {{
                var d = dlgs[i];
                var h = d.querySelector('h2,[role="heading"]');
                var btns = [];
                d.querySelectorAll('[role="button"],button').forEach(function(b) {{
                    if (iv(b)) {{ var t = b.textContent.trim(); if (t && t.length < 30 && btns.length < 8) btns.push(t); }}
                }});
                var inps = [];
                d.querySelectorAll('input:not([type="hidden"]),textarea,[contenteditable="true"]').forEach(function(inp) {{
                    if (iv(inp) || (inp.type === 'file')) {{
                        var desc = inp.placeholder || inp.getAttribute('aria-placeholder') || inp.type || 'ce';
                        if (inps.length < 4) inps.push(desc.substring(0,25));
                    }}
                }});
                out.dlgs.push({{i: i, title: h ? h.textContent.trim().substring(0,25) : '', btns: btns, inps: inps}});
            }}
            return JSON.stringify(out);
        }})()""")
        info = r.get('result', '{}')
        if label: print(f"    📋 [{label}]: {info[:300]}")
        return info

    # ── Step counter ──
    total = 11
    step_n = [0]
    def S(title):
        step_n[0] += 1
        print(f"\n{'━'*60}\n[{step_n[0]}/{total}] {title}\n{'━'*60}")

    # ════════════════════════════════════════════════════════
    print("=" * 60)
    print(f"📘 Facebook Auto-Post v3 (DNA-based, dialog-aware)")
    print(f"   Video:    {os.path.basename(video_path)} ({os.path.getsize(video_path):,} bytes)")
    print(f"   Page ID:  {page_id}")
    if caption:    print(f"   Caption:  {caption[:60]}")
    if reel_title: print(f"   Title:    {reel_title[:60]}")
    print("=" * 60)

    # ════════════════════════════════════════════════════════
    # STEP 1: FIND OR SWITCH TO FACEBOOK TAB (Non-disruptive)
    # ════════════════════════════════════════════════════════
    S("Facebook Tab Handling")
    
    # 1a. List all tabs and look for Facebook
    pages_info = agent.tab_list()
    fb_tab = None
    if pages_info and pages_info.get('success'):
        pages = pages_info.get('data', [])
        for p_obj in pages:
            url = p_obj.get('url', '')
            if 'facebook.com' in url:
                # If page_id is provided, try to find that specific page
                if page_id and str(page_id) in url:
                    fb_tab = p_obj
                    print(f"    ✅ Found matching tab for Page {page_id}: {url[:60]}")
                    break
                # If page_id is NOT provided, take the first Facebook tab found
                elif not page_id:
                    fb_tab = p_obj
                    print(f"    ✅ Found existing Facebook tab: {url[:60]}")
                    break
    
    # 1b. Act on the found tab or open new
    if fb_tab:
        agent.tab_activate(fb_tab['id'])
        target_url = fb_tab['url']
        print(f"    🔄 Reloading existing tab: {target_url[:60]}")
        agent.navigate(target_url)
    else:
        if not page_id:
            print("    ❌ No Facebook tab found and no Page ID provided via -P argument."); return False
        
        target_url = f"https://www.facebook.com/profile.php?id={page_id}"
        print(f"    🚀 No existing tab found. Opening new: {target_url}")
        agent.navigate(target_url)
        wait(8, "Page loading")

    # 1c. Wait for page readiness
    for w in range(12):
        r = js("document.querySelectorAll('span').length > 10 && document.readyState === 'complete' ? 'READY' : 'LOADING'")
        if r.get('result','') == 'READY':
            print(f"    ✅ Page ready ({w*2}s)")
            break
        wait(2)

    capture_env("after_navigate")
    action_lib["navigate"] = "OK"

    # ════════════════════════════════════════════════════════
    # STEP 2: OPEN COMPOSER DIALOG
    # DNA: page:span:Bạn đang nghĩ gì?  → opens 2 dialogs
    # ════════════════════════════════════════════════════════
    S("Open Composer Dialog")
    r = js(f"document.querySelectorAll('{DLG}').length")
    dlg_count = int(r.get('result', '0') or '0')
    if dlg_count >= 2:
        print("    ✅ Dialog already open (from previous state)")
    else:
        # Find and click "Bạn đang nghĩ gì?" on page
        r = js("""(function(){
            var spans = document.querySelectorAll('span');
            for (var s of spans) {
                var t = s.textContent.trim();
                // Match "Bạn đang nghĩ gì?" or other language variants 
                if ((t.includes('Bạn đang nghĩ gì') || t.includes("What's on your mind")) && s.offsetParent !== null) {
                    var rect = s.getBoundingClientRect();
                    return JSON.stringify({x: (rect.left+rect.width/2)/window.innerWidth, y: (rect.top+rect.height/2)/window.innerHeight});
                }
            }
            return JSON.stringify({error: 'NOT_FOUND'});
        })()""")
        try:
            data = json.loads(r.get('result', '{}'))
        except:
            data = {"error": "PARSE"}
        if 'error' not in data:
            click_at(data['x'], data['y'], "Bạn đang nghĩ gì?")
        else:
            print(f"    ❌ Cannot find composer button")

        wait(4, "Dialog opening")

    # Verify 2 dialogs exist
    for attempt in range(8):
        r = js(f"document.querySelectorAll('{DLG}').length")
        cnt = int(r.get('result', '0') or '0')
        if cnt >= 2:
            print(f"    ✅ {cnt} dialogs open")
            break
        wait(1)
    else:
        print("    ⚠️ Expected 2 dialogs, got", cnt)

    capture_env("after_composer")
    action_lib["open_composer"] = "OK"

    # ════════════════════════════════════════════════════════
    # STEP 3: TYPE CAPTION in dialog[0]
    # DNA: dialog[0]:p: → contenteditable textbox
    # ════════════════════════════════════════════════════════
    S("Type Caption")
    if caption:
        # Focus the contenteditable in dialog[0]
        r = js(f"""(function(){{
            var dlgs = document.querySelectorAll('{DLG}');
            if (dlgs.length < 1) return 'NO_DIALOG';
            var dlg = dlgs[0];
            var editor = dlg.querySelector('div[contenteditable="true"][role="textbox"]');
            if (!editor) return 'NO_EDITOR';
            editor.focus(); editor.click();
            return 'FOCUSED:' + editor.textContent.trim().substring(0, 20);
        }})()""")
        print(f"    Focus: {r.get('result','?')}")
        wait(0.5)

        # Type using hand_execute_action (verified working in v2 tests)
        r = agent._send_command("hand_execute_action", {"action": "type", "text": caption})
        print(f"    Type: {'✅' if r.get('success') else '❌'}")
        wait(1)

        # Verify
        r = js(f"""(function(){{
            var dlg = document.querySelectorAll('{DLG}')[0];
            if (!dlg) return 'NO_DLG';
            var e = dlg.querySelector('div[contenteditable="true"][role="textbox"]');
            return e ? 'TEXT:' + e.textContent.trim().substring(0,40) : 'NO_EDITOR';
        }})()""")
        print(f"    Verify: {r.get('result','?')[:50]}")
        action_lib["caption"] = "OK" if 'TEXT:' in r.get('result','') else "PARTIAL"
    else:
        print("    ⏭ No caption")
        action_lib["caption"] = "SKIP"

    capture_env("after_caption")

    # ════════════════════════════════════════════════════════
    # STEP 4-5: UPLOAD VIDEO via DataTransfer injection
    # Recording: user clicked IMG icon → OS file dialog → selected video
    # Bot approach: inject directly via DataTransfer (no OS dialog needed)
    # Key: modify input[type="file"] accept attribute to include video/*
    # ════════════════════════════════════════════════════════
    S("Upload Video")

    # Step 4b: Read video and chunk into browser memory
    with open(os.path.abspath(video_path), "rb") as f:
        vb = f.read()
    CHUNK = 256 * 1024
    tc = (len(vb) + CHUNK - 1) // CHUNK
    print(f"    Injecting {len(vb):,} bytes ({tc} chunks)...")
    js("window.__fbvc=[]")
    for i in range(tc):
        b64 = base64.b64encode(vb[i*CHUNK:(i+1)*CHUNK]).decode("ascii")
        js(f"(function(){{var r=atob('{b64}');var a=new Uint8Array(r.length);for(var j=0;j<r.length;j++)a[j]=r.charCodeAt(j);window.__fbvc.push(a)}})()") 
        if (i+1) % 20 == 0 or i == tc-1:
            print(f"      Chunk {i+1}/{tc}")

    fn = os.path.basename(video_path).replace("'", "\\'")
    ext = os.path.splitext(video_path)[1].lower()
    mime_map = {'.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo', '.webm': 'video/webm'}
    mime = mime_map.get(ext, 'video/mp4')

    # Step 4c: Inject into file input
    # Key fix: force accept attribute to include video/* before injecting
    r = js(f"""(function(){{
        var c = window.__fbvc; if(!c) return JSON.stringify({{error:'no_chunks'}});
        var t = 0; for(var x of c) t += x.length;
        var m = new Uint8Array(t);
        var o = 0; for(var x of c) {{ m.set(x, o); o += x.length; }}
        delete window.__fbvc;
        var file = new File([m], '{fn}', {{type: '{mime}', lastModified: Date.now()}});
        
        // Find file input — prefer one that already accepts video
        var dlgs = document.querySelectorAll('[role="dialog"]');
        var inp = null;
        if (dlgs[0]) {{
            var inputs = dlgs[0].querySelectorAll('input[type="file"]');
            for (var i of inputs) {{
                var accept = i.getAttribute('accept') || '';
                if (accept.includes('video')) {{ inp = i; break; }}
            }}
            if (!inp && inputs.length > 0) inp = inputs[0];
        }}
        if (!inp) {{
            var all = document.querySelectorAll('input[type="file"]');
            for (var i of all) {{
                var accept = i.getAttribute('accept') || '';
                if (accept.includes('video')) {{ inp = i; break; }}
            }}
            if (!inp && all.length > 0) inp = all[0];
        }}
        if (!inp) return JSON.stringify({{error:'no_input'}});
        
        // Force accept to include video/* so FB frontend allows video
        var origAccept = inp.getAttribute('accept') || '';
        if (!origAccept.includes('video')) {{
            inp.setAttribute('accept', origAccept + ',video/*,video/mp4');
        }}
        
        var dt = new DataTransfer();
        dt.items.add(file);
        inp.files = dt.files;
        inp.dispatchEvent(new Event('change', {{bubbles: true}}));
        inp.dispatchEvent(new Event('input', {{bubbles: true}}));
        return JSON.stringify({{ok:true, size:file.size, name:file.name, accept:inp.getAttribute('accept').substring(0,80), origAccept: origAccept.substring(0,60)}});
    }})()""")
    result = r.get('result', '?')
    print(f"    File input: {result[:120]}")
    try:
        upload_ok = json.loads(result).get('ok', False)
    except:
        upload_ok = False
    action_lib["upload"] = "OK" if upload_ok else "FAIL"

    # ════════════════════════════════════════════════════════
    # STEP 6: WAIT FOR VIDEO PROCESSING
    # ════════════════════════════════════════════════════════
    S("Wait for Video Processing")
    for i in range(40):
        wait(3)
        env = capture_env("processing" if (i+1) % 5 == 0 else "")
        try:
            env_data = json.loads(env)
            dlgs = env_data.get('dlgs', [])
            if dlgs:
                btns = dlgs[0].get('btns', [])
                if 'Tiếp' in btns:
                    print(f"    ✅ 'Tiếp' button appeared ({(i+1)*3}s) — video ready!")
                    break
        except:
            pass
    action_lib["processing"] = "OK"

    # ════════════════════════════════════════════════════════
    # STEP 7: CLICK "Tiếp" (1st) — Enter Reels flow
    # DNA: dialog[0]:div:Tiếp
    # ════════════════════════════════════════════════════════
    S('Click "Tiếp" (1st → Reels Editor)')
    ok = find_and_click("Tiếp", dlg_index=0, desc="Tiếp-1st")
    wait(5, "Loading Reels editor")
    capture_env("after_tiep1")
    action_lib["tiep_1"] = "OK" if ok else "FAIL"

    # ════════════════════════════════════════════════════════
    # STEP 8: TYPE REEL TITLE
    # DNA: dialog[0]:text:Tiêu đề thước phim
    # Stable selector: input[placeholder="Tiêu đề thước phim"]
    # ════════════════════════════════════════════════════════
    S("Type Reel Title")
    title_text = reel_title or caption[:50] if caption else ""
    if title_text:
        # Find title input — try multiple selector strategies
        r = js(f"""(function(){{
            var dlgs = document.querySelectorAll('{DLG}');
            if (dlgs.length < 1) return JSON.stringify({{error: 'NO_DLG'}});
            var dlg = dlgs[0];
            // Strategy 1: exact placeholder
            var inp = dlg.querySelector('input[placeholder="Tiêu đề thước phim"]');
            // Strategy 2: partial placeholder match
            if (!inp) {{
                var inputs = dlg.querySelectorAll('input[type="text"]');
                for (var i of inputs) {{
                    var ph = i.placeholder || '';
                    if (ph.toLowerCase().includes('tiêu đề') || ph.toLowerCase().includes('title')) {{
                        inp = i; break;
                    }}
                }}
            }}
            // Strategy 3: first visible text input in dialog
            if (!inp) {{
                var inputs = dlg.querySelectorAll('input[type="text"]');
                for (var i of inputs) {{
                    if (i.offsetParent !== null) {{ inp = i; break; }}
                }}
            }}
            if (!inp) return JSON.stringify({{error: 'NO_TITLE_INPUT'}});
            var rect = inp.getBoundingClientRect();
            return JSON.stringify({{
                x: (rect.left+rect.width/2)/window.innerWidth,
                y: (rect.top+rect.height/2)/window.innerHeight,
                ph: inp.placeholder || '',
                visible: inp.offsetParent !== null
            }});
        }})()""")
        try:
            data = json.loads(r.get('result', '{}'))
        except:
            data = {"error": "PARSE"}
        
        if 'error' not in data:
            print(f"    📍 Title input found: placeholder='{data.get('ph','')}' visible={data.get('visible',False)}")
            click_at(data['x'], data['y'], "Tiêu đề thước phim input")
            wait(0.5)
            agent._send_command("hand_execute_action", {"action": "type", "text": title_text})
            print(f"    ✅ Typed title: {title_text[:40]}")
            action_lib["title"] = "OK"
        else:
            print(f"    ❌ Title input not found: {data['error']}")
            action_lib["title"] = "FAIL"
    else:
        print("    ⏭ No title")
        action_lib["title"] = "SKIP"

    capture_env("after_title")

    # ════════════════════════════════════════════════════════
    # STEP 9: CLICK "Tiếp" (2nd → Publish screen)
    # DNA: dialog[0]:span:Tiếp
    # ════════════════════════════════════════════════════════
    S('Click "Tiếp" (2nd → Publish)')
    wait(2)
    ok = find_and_click("Tiếp", dlg_index=0, desc="Tiếp-2nd")
    wait(5, "Loading publish screen")
    capture_env("after_tiep2")
    action_lib["tiep_2"] = "OK" if ok else "FAIL"

    # ════════════════════════════════════════════════════════
    # STEP 10: CLICK "Đăng" (Publish)
    # DNA: dialog[0]:span:Đăng
    # Screen shows: "Lưu", "Đăng" buttons
    # ════════════════════════════════════════════════════════
    S('Click "Đăng" (Publish)')
    wait(2)
    ok = find_and_click("Đăng", dlg_index=0, desc="Đăng")
    if not ok:
        # Try alternatives
        for alt in ["Đăng thước phim", "Chia sẻ", "Đăng bài"]:
            if find_and_click(alt, dlg_index=0, desc=f"Đăng ({alt})"):
                ok = True
                break
    action_lib["publish"] = "OK" if ok else "FAIL"
    wait(5, "Publishing...")

    # ════════════════════════════════════════════════════════
    # STEP 11: HANDLE POST-DIALOG + VERIFY
    # DNA: dialog[2]:span:Lúc khác (WhatsApp popup)
    # ════════════════════════════════════════════════════════
    S("Handle Post-Dialogs & Verify")
    
    # Wait a bit then check for popups
    wait(5)
    for attempt in range(6):
        env = capture_env("post_check" if attempt == 0 else "")
        try:
            env_data = json.loads(env)
            n_dlg = env_data.get('dlgCount', 0)
            
            if n_dlg == 0:
                print(f"    ✅ All dialogs closed — post success!")
                action_lib["verify"] = "OK"
                break
            
            # Check for popup (dialog[2] or any dialog with "Lúc khác")
            if n_dlg >= 3:
                print(f"    ⚠️ {n_dlg} dialogs — checking for popup...")
                # Try clicking "Lúc khác" in the topmost dialog
                for di in range(n_dlg - 1, -1, -1):
                    if find_and_click("Lúc khác", dlg_index=di, desc=f"Lúc khác (dialog[{di}])"):
                        print(f"    ✅ Dismissed popup in dialog[{di}]")
                        wait(2)
                        break
            elif n_dlg >= 1:
                # Check if it's the WhatsApp popup even with fewer dialogs
                dlgs = env_data.get('dlgs', [])
                for d in dlgs:
                    if 'Lúc khác' in d.get('btns', []):
                        find_and_click("Lúc khác", dlg_index=d['i'], desc="Lúc khác")
                        wait(2)
                        break
        except:
            pass
        wait(3)
    else:
        print("    ⚠️ Dialogs still open after attempts")
        action_lib["verify"] = "PARTIAL"

    if "verify" not in action_lib:
        # Final check
        r = js(f"document.querySelectorAll('{DLG}').length")
        cnt = int(r.get('result', '0') or '0')
        action_lib["verify"] = "OK" if cnt == 0 else "PARTIAL"

    # ════════════════════════════════════════════════════════
    # SUMMARY
    # ════════════════════════════════════════════════════════
    print(f"\n{'━'*60}")
    print("ACTION LIBRARY RESULTS")
    print(f"{'━'*60}")
    all_ok = True
    for k, v in action_lib.items():
        icon = "✅" if v in ("OK", "SKIP") else "❌" if v == "FAIL" else "⚠️"
        if v == "FAIL": all_ok = False
        print(f"  {icon} {k}: {v}")

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "action_library.json")
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(action_lib, f, indent=2, ensure_ascii=False)
    print(f"  → Saved: {out}")
    print(f"\n{'✅ POST SUCCESSFUL!' if all_ok else '❌ Check manually — some steps may have failed'}")

    agent.close()
    return all_ok


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Facebook Auto-Post v3")
    p.add_argument("video", help="Path to video file")
    p.add_argument("-P", "--page-id", default=None, help="Target Facebook Page ID (optional if tab exists)")
    p.add_argument("-c", "--caption", default="")
    p.add_argument("-t", "--title", default="")
    p.add_argument("-s", "--schedule", default=None, help="Schedule time (ISO format)")
    args = p.parse_args()
    fb_post(args.video, args.page_id, args.caption, args.title, args.schedule)
