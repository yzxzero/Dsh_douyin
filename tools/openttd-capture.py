"""Capture only the OpenTTD client window for the local live overlay."""
import ctypes as c, ctypes.wintypes as w, io, sys, time
from http.server import HTTPServer, BaseHTTPRequestHandler
from PIL import Image
user=c.windll.user32;gdi=c.windll.gdi32
user.SetProcessDPIAware()
user.GetDC.restype=w.HDC;gdi.CreateCompatibleDC.restype=w.HDC;gdi.CreateCompatibleBitmap.restype=w.HBITMAP;gdi.SelectObject.restype=w.HGDIOBJ
user.GetDC.argtypes=[w.HWND];user.GetClientRect.argtypes=[w.HWND,c.POINTER(w.RECT)];user.IsIconic.argtypes=[w.HWND]
user.PrintWindow.argtypes=[w.HWND,w.HDC,w.UINT];user.ReleaseDC.argtypes=[w.HWND,w.HDC]
gdi.CreateCompatibleDC.argtypes=[w.HDC];gdi.CreateCompatibleBitmap.argtypes=[w.HDC,c.c_int,c.c_int]
gdi.SelectObject.argtypes=[w.HDC,w.HGDIOBJ];gdi.DeleteObject.argtypes=[w.HGDIOBJ];gdi.DeleteDC.argtypes=[w.HDC]
gdi.GetDIBits.argtypes=[w.HDC,w.HBITMAP,w.UINT,w.UINT,c.c_void_p,c.c_void_p,w.UINT]
pid=int(sys.argv[1])
class BITMAPINFOHEADER(c.Structure):
 _fields_=[('size',w.DWORD),('width',w.LONG),('height',w.LONG),('planes',w.WORD),('bits',w.WORD),('compression',w.DWORD),('imageSize',w.DWORD),('x',w.LONG),('y',w.LONG),('used',w.DWORD),('important',w.DWORD)]
def capture():
 found=[]
 @c.WINFUNCTYPE(w.BOOL,w.HWND,w.LPARAM)
 def enum(hwnd,param):
  p=w.DWORD();user.GetWindowThreadProcessId(hwnd,c.byref(p))
  if p.value==pid and user.IsWindowVisible(hwnd):found.append(hwnd)
  return True
 user.EnumWindows(enum,0)
 if not found:raise RuntimeError('OpenTTD client not visible')
 hwnd=found[0];rect=w.RECT();user.GetClientRect(hwnd,c.byref(rect));width=rect.right;height=rect.bottom
 if width<100 or height<100 or user.IsIconic(hwnd):raise RuntimeError('Restore OpenTTD window')
 dc=user.GetDC(hwnd);mem=gdi.CreateCompatibleDC(dc);bm=gdi.CreateCompatibleBitmap(dc,width,height);old=gdi.SelectObject(mem,bm)
 try:
  if not user.PrintWindow(hwnd,mem,3):raise RuntimeError('Capture failed')
  info=BITMAPINFOHEADER(c.sizeof(BITMAPINFOHEADER),width,-height,1,32,0,0,0,0,0,0);buf=c.create_string_buffer(width*height*4)
  if not gdi.GetDIBits(mem,bm,0,height,buf,c.byref(info),0):raise RuntimeError('Bitmap failed')
  img=Image.frombuffer('RGB',(width,height),buf,'raw','BGRX',0,1);img.thumbnail((1280,720));out=io.BytesIO();img.save(out,'JPEG',quality=78);return out.getvalue()
 finally:
  gdi.SelectObject(mem,old);gdi.DeleteObject(bm);gdi.DeleteDC(mem);user.ReleaseDC(hwnd,dc)
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  try:
   frame=capture();self.send_response(200);self.send_header('Content-Type','image/jpeg');self.end_headers();self.wfile.write(frame)
  except Exception as e:self.send_error(503,str(e))
 def log_message(self,*args):pass
HTTPServer(('127.0.0.1',8867),Handler).serve_forever()
