"""Capture only the owned Luanti window with Windows Graphics Capture."""
import ctypes as c,ctypes.wintypes as w,sys,time,threading
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
import cv2
from windows_capture import WindowsCapture
user=c.windll.user32;user.SetProcessDPIAware();pid=int(sys.argv[1]);windows=[]
@c.WINFUNCTYPE(w.BOOL,w.HWND,w.LPARAM)
def enum(hwnd,param):
 p=w.DWORD();user.GetWindowThreadProcessId(hwnd,c.byref(p))
 if p.value==pid and user.IsWindowVisible(hwnd):windows.append(hwnd)
 return True
user.EnumWindows(enum,0)
if len(windows)!=1:raise RuntimeError('Expected one Luanti window for capture')
hwnd=windows[0];latest=None;updated=0;lock=threading.Lock()
user.GetClientRect.argtypes=[w.HWND,c.POINTER(w.RECT)];user.ClientToScreen.argtypes=[w.HWND,c.POINTER(w.POINT)]
c.windll.dwmapi.DwmGetWindowAttribute.argtypes=[w.HWND,w.DWORD,c.c_void_p,w.DWORD]
capture=WindowsCapture(cursor_capture=False,draw_border=False,window_hwnd=hwnd,minimum_update_interval=150)
@capture.event
def on_frame_arrived(frame,control):
 global latest,updated
 raw=frame.frame_buffer[:,:,:3]
 rect=w.RECT();pos=w.POINT(0,0);bounds=w.RECT()
 user.GetClientRect(hwnd,c.byref(rect));user.ClientToScreen(hwnd,c.byref(pos))
 c.windll.dwmapi.DwmGetWindowAttribute(hwnd,9,c.byref(bounds),c.sizeof(bounds))
 x=max(0,pos.x-bounds.left);y=max(0,pos.y-bounds.top)
 if x+rect.right<=frame.width and y+rect.bottom<=frame.height:raw=raw[y:y+rect.bottom,x:x+rect.right]
 if raw.size==0:return
 height,width=raw.shape[:2]
 if width>1280:raw=cv2.resize(raw,(1280,round(height*1280/width)))
 ok,jpeg=cv2.imencode('.jpg',raw,[int(cv2.IMWRITE_JPEG_QUALITY),80])
 if ok:
  with lock:latest=jpeg.tobytes();updated=time.monotonic()
@capture.event
def on_closed():
 global latest
 with lock:latest=None
control=capture.start_free_threaded()
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  with lock:data=latest;age=time.monotonic()-updated
  if data is None or age>10:self.send_error(503,'Luanti capture not ready; restore game window');return
  self.send_response(200);self.send_header('Content-Type','image/jpeg');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
 def log_message(self,*args):pass
ThreadingHTTPServer(('127.0.0.1',8869),Handler).serve_forever()
