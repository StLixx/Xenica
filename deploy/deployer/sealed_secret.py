"""GitHub Actions 的 libsodium sealed box；只传密文，不打印短期会话。"""
import base64
import ctypes
import ctypes.util

def seal(value,key):
    library=ctypes.util.find_library('sodium')
    if not library:raise RuntimeError('libsodium is required for encrypted test authorization')
    sodium=ctypes.CDLL(library)
    sodium.sodium_init.restype=ctypes.c_int
    sodium.crypto_box_seal.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_ulonglong,ctypes.c_void_p]
    sodium.crypto_box_seal.restype=ctypes.c_int
    if sodium.sodium_init()<0:raise RuntimeError('libsodium initialization failed')
    public=base64.b64decode(key,validate=True)
    if len(public)!=32:raise RuntimeError('invalid Actions public key')
    output=ctypes.create_string_buffer(len(value)+48)
    if sodium.crypto_box_seal(output,value,len(value),public)!=0:raise RuntimeError('test authorization encryption failed')
    return base64.b64encode(output.raw).decode()
