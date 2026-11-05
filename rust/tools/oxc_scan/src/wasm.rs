//! The browser's scanner: `scan` below is the CLI's `--no-start` scan of one file, the same facts byte for byte.
//! The page calls `alloc`, writes the source and the file name into the memory it gives, calls `scan`, and reads
//! `out_len` bytes at `out_ptr`. A refusal comes back as the `parse_error` fact, the status says it was one.
use std::cell::RefCell;

thread_local! { static OUT: RefCell<String> = const { RefCell::new(String::new()) }; }

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

#[no_mangle]
pub extern "C" fn release(ptr: *mut u8, len: usize) {
    unsafe { drop(Vec::from_raw_parts(ptr, 0, len.max(1))) }
}

/// 0 the file was read, 1 it was refused (or its bytes were not text)
#[no_mangle]
pub extern "C" fn scan(src: *const u8, src_len: usize, file: *const u8, file_len: usize) -> u32 {
    crate::set_no_start();
    let (src, file) = unsafe { (std::slice::from_raw_parts(src, src_len), std::slice::from_raw_parts(file, file_len)) };
    let (Ok(src), Ok(file)) = (std::str::from_utf8(src), std::str::from_utf8(file)) else { return 1 };
    let (text, status) = match crate::scan(src, file) {
        Ok(t) => (t, 0),
        Err(t) => (t, 1),
    };
    OUT.with(|o| *o.borrow_mut() = text);
    status
}

#[no_mangle]
pub extern "C" fn out_ptr() -> *const u8 {
    OUT.with(|o| o.borrow().as_ptr())
}

#[no_mangle]
pub extern "C" fn out_len() -> usize {
    OUT.with(|o| o.borrow().len())
}
