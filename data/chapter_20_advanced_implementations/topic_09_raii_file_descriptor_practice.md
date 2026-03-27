## TOPIC: RAII File Descriptor Wrapper - Resource Management

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
class FileDescriptor {
    int fd_;

public:
    FileDescriptor(const char* path) {
        fd_ = open(path, O_RDONLY);
        if (fd_ < 0) {
            throw std::runtime_error("Failed to open file");
        }
    }

    ~FileDescriptor() {
        close(fd_);  // Bug: doesn't check if close() fails!
    }

    int get() { return fd_; }
};

int main() {
    {
        FileDescriptor fd("/path/to/file");
        // Use file...
    }  // Destructor runs, close() may fail silently!
}
```

**Answer:**
```
Silent failure (close() errors not detected, potential data loss)
```

**Explanation:**
- `close()` can fail (e.g., disk full, network filesystem error)
- Destructor ignores `close()` return value
- Failed `close()` may lose buffered data writes
- No way for caller to know close failed
- Destructors shouldn't throw, so can't propagate error
- Should log error or set error flag
- **Key Concept:** close() can fail and lose data; RAII destructors can't throw exceptions; must handle errors via logging, error flags, or explicit close() method that can throw

**Fixed Version:**
```cpp
class FileDescriptor {
    int fd_;
    bool closed_;

public:
    FileDescriptor(const char* path) : fd_(-1), closed_(false) {
        fd_ = open(path, O_RDONLY);
        if (fd_ < 0) {
            throw std::runtime_error("Failed to open file");
        }
    }

    ~FileDescriptor() {
        if (!closed_ && fd_ >= 0) {
            if (close(fd_) < 0) {
                std::cerr << "Warning: close() failed: " << strerror(errno) << "\n";
            }
        }
    }

    // Explicit close that can throw
    void close() {
        if (!closed_ && fd_ >= 0) {
            if (::close(fd_) < 0) {
                throw std::runtime_error("close() failed");
            }
            closed_ = true;
        }
    }

    int get() { return fd_; }
};
```

---

#### Q2
```cpp
class FileDescriptor {
    int fd_;

public:
    FileDescriptor(int fd) : fd_(fd) {}

    ~FileDescriptor() {
        if (fd_ >= 0) {
            close(fd_);
        }
    }

    // Bug: copyable!
};

int main() {
    FileDescriptor fd1(open("file.txt", O_RDONLY));
    FileDescriptor fd2 = fd1;  // Bug: copies file descriptor!

    // Both destructors run, close same FD twice!
}
```

**Answer:**
```
Double-close error (undefined behavior, may close unrelated file descriptor)
```

**Explanation:**
- Default copy constructor copies `fd_` value
- `fd2` and `fd1` both hold same file descriptor number
- `fd2` destructs first → closes file descriptor
- `fd1` destructs → closes already-closed descriptor → undefined behavior
- Worse: if another `open()` reused the FD number, we close wrong file!
- Classic double-close bug
- Must delete copy constructor/assignment
- **Key Concept:** File descriptors are non-copyable resources; copying FD number creates double-close; delete copy operations or implement reference counting; prefer move-only semantics

**Fixed Version:**
```cpp
class FileDescriptor {
    int fd_;

public:
    FileDescriptor(int fd) : fd_(fd) {}

    ~FileDescriptor() {
        if (fd_ >= 0) {
            close(fd_);
        }
    }

    // Delete copy operations
    FileDescriptor(const FileDescriptor&) = delete;
    FileDescriptor& operator=(const FileDescriptor&) = delete;

    // Allow move operations
    FileDescriptor(FileDescriptor&& other) noexcept : fd_(other.fd_) {
        other.fd_ = -1;
    }

    FileDescriptor& operator=(FileDescriptor&& other) noexcept {
        if (this != &other) {
            if (fd_ >= 0) close(fd_);
            fd_ = other.fd_;
            other.fd_ = -1;
        }
        return *this;
    }

    int get() const { return fd_; }
};
```

---

#### Q3
```cpp
class FileDescriptor {
    int fd_;

public:
    FileDescriptor(int fd) : fd_(fd) {}

    ~FileDescriptor() {
        if (fd_ >= 0) {
            close(fd_);
        }
    }

    FileDescriptor(FileDescriptor&& other) noexcept : fd_(other.fd_) {
        other.fd_ = -1;
    }

    FileDescriptor& operator=(FileDescriptor&& other) noexcept {
        fd_ = other.fd_;  // Bug: doesn't close current FD!
        other.fd_ = -1;
        return *this;
    }
};

int main() {
    FileDescriptor fd1(open("file1.txt", O_RDONLY));
    FileDescriptor fd2(open("file2.txt", O_RDONLY));

    fd1 = std::move(fd2);  // Bug: file1.txt descriptor leaked!
}
```

**Answer:**
```
File descriptor leak (fd1's original file descriptor never closed)
```

**Explanation:**
- `fd1` initially holds descriptor for file1.txt
- Move assignment copies `fd2`'s descriptor, sets `fd2` to -1
- But never closes `fd1`'s original descriptor
- file1.txt's descriptor leaked
- Move assignment must close current resource before taking new one
- Similar to move assignment for unique_ptr
- **Key Concept:** Move assignment must release current resource before acquiring new one; forgetting to close old FD causes leak; always close/delete current resource in move assignment

**Fixed Version:**
```cpp
FileDescriptor& operator=(FileDescriptor&& other) noexcept {
    if (this != &other) {
        if (fd_ >= 0) {
            close(fd_);  // Close current FD first!
        }
        fd_ = other.fd_;
        other.fd_ = -1;
    }
    return *this;
}
```

---

#### Q4
```cpp
class FileDescriptor {
    int fd_;

public:
    FileDescriptor(const char* path) {
        fd_ = open(path, O_RDONLY);
        // Bug: doesn't check for errors!
    }

    ~FileDescriptor() {
        close(fd_);
    }

    ssize_t read(void* buf, size_t count) {
        return ::read(fd_, buf, count);
    }
};

int main() {
    FileDescriptor fd("/nonexistent/path");  // open() fails, fd_ = -1

    char buffer[100];
    ssize_t n = fd.read(buffer, sizeof(buffer));  // Bug: reading from invalid FD!

    std::cout << "Read " << n << " bytes\n";  // n = -1 (error)
}
```

**Answer:**
```
Invalid file descriptor error (read() on fd=-1 returns -1, errno=EBADF)
```

**Explanation:**
- `open()` fails → returns -1
- Constructor doesn't check, stores -1 in `fd_`
- `read()` called with fd=-1 → returns -1, sets errno to EBADF (bad file descriptor)
- Destructor calls `close(-1)` → harmless but incorrect
- Object in invalid state, all operations fail
- Constructor should check and throw exception
- **Key Concept:** Failed resource acquisition must be detected in constructor; storing invalid handle creates unusable object; constructors should throw on failure to prevent partially-constructed objects

**Fixed Version:**
```cpp
FileDescriptor(const char* path) {
    fd_ = open(path, O_RDONLY);
    if (fd_ < 0) {
        throw std::runtime_error(std::string("Failed to open: ") + strerror(errno));
    }
}
```

---

#### Q5
```cpp
class FileDescriptor {
    int fd_;

public:
    FileDescriptor(int fd) : fd_(fd) {}

    ~FileDescriptor() {
        if (fd_ >= 0) {
            close(fd_);
        }
    }

    int get() const { return fd_; }  // Bug: returns raw handle!
};

void some_function(int fd) {
    // ... does something ...
    close(fd);  // Bug: closes the descriptor!
}

int main() {
    FileDescriptor fd(open("file.txt", O_RDONLY));

    some_function(fd.get());  // Bug: passes ownership!

    // Destructor runs - closes already-closed FD!
}
```

**Answer:**
```
Double-close error (some_function closes FD, then destructor closes again)
```

**Explanation:**
- `fd.get()` returns raw file descriptor
- `some_function()` receives and closes it
- Caller has no way to know function took ownership
- Destructor runs → closes already-closed descriptor
- Classic ownership confusion bug
- `get()` should be used only for inspection, not ownership transfer
- Need explicit ownership transfer mechanism (release() method)
- **Key Concept:** Returning raw handles from RAII wrappers dangerous; no way to communicate ownership transfer; provide release() to explicitly transfer ownership and prevent double-close

**Fixed Version:**
```cpp
class FileDescriptor {
    int fd_;

public:
    FileDescriptor(int fd) : fd_(fd) {}

    ~FileDescriptor() {
        if (fd_ >= 0) {
            close(fd_);
        }
    }

    // For inspection only (const qualifier emphasizes this)
    int get() const { return fd_; }

    // Explicit ownership transfer
    int release() {
        int tmp = fd_;
        fd_ = -1;  // Give up ownership
        return tmp;
    }
};

// Better API: take RAII wrapper by move
void some_function(FileDescriptor fd) {
    // Takes ownership, will close on destruction
    // Use fd.get() for operations
}

int main() {
    FileDescriptor fd(open("file.txt", O_RDONLY));
    some_function(std::move(fd));  // Explicit ownership transfer
    // fd is now in moved-from state, destructor won't close
}
```

---

#### Q6
```cpp
class FileDescriptor {
    int fd_;

public:
    explicit FileDescriptor(int fd) : fd_(fd) {}

    ~FileDescriptor() {
        if (fd_ >= 0) {
            close(fd_);
        }
    }

    FileDescriptor(const FileDescriptor&) = delete;
    FileDescriptor& operator=(const FileDescriptor&) = delete;
};

int main() {
    int raw_fd = open("file.txt", O_RDONLY);

    FileDescriptor fd(raw_fd);

    // Later, someone else uses raw_fd
    close(raw_fd);  // Bug: manual close!

    // Destructor runs - double-close!
}
```

**Answer:**
```
Double-close error (manual close + destructor close)
```

**Explanation:**
- Both raw FD and RAII wrapper exist
- Mix of manual and automatic resource management
- Manual `close(raw_fd)` closes descriptor
- Destructor also closes → double-close
- Should never mix RAII with manual management of same resource
- Either use RAII everywhere or manual everywhere
- Prefer RAII for safety
- **Key Concept:** Mixing RAII with manual resource management causes double-free; once resource wrapped in RAII, never manually manage it; maintain single ownership model throughout codebase

**Fixed Version:**
```cpp
int main() {
    // Option 1: RAII from the start
    FileDescriptor fd(open("file.txt", O_RDONLY));
    // No raw_fd variable, RAII owns from creation

    // Option 2: If raw FD needed temporarily
    int raw_fd = open("file.txt", O_RDONLY);
    {
        FileDescriptor fd(raw_fd);
        // Use fd.get() for operations
    }  // FD closed here by destructor

    // raw_fd now invalid, don't use it!

    // Option 3: Document ownership transfer
    int raw_fd = open("file.txt", O_RDONLY);
    FileDescriptor fd(raw_fd);
    // raw_fd conceptually transferred, DON'T touch it anymore!
}
```

---

#### Q7
```cpp
class FileDescriptor {
    int fd_;

public:
    FileDescriptor() : fd_(-1) {}  // Default constructor

    FileDescriptor(int fd) : fd_(fd) {}

    ~FileDescriptor() {
        if (fd_ >= 0) {
            close(fd_);
        }
    }

    void reset(int fd) {  // Bug: doesn't close current FD!
        fd_ = fd;
    }
};

int main() {
    FileDescriptor fd(open("file1.txt", O_RDONLY));

    fd.reset(open("file2.txt", O_RDONLY));  // Bug: file1.txt leaked!

    // Only file2.txt closed by destructor
}
```

**Answer:**
```
File descriptor leak (file1.txt's descriptor never closed)
```

**Explanation:**
- `fd` initially wraps file1.txt descriptor
- `reset()` overwrites `fd_` with file2.txt descriptor
- Never closes file1.txt descriptor → leaked
- Similar bug to move assignment issue
- `reset()` must close current resource before acquiring new one
- **Key Concept:** Methods that reassign resources must release current resource first; reset() should close old FD before storing new one; always maintain resource invariant

**Fixed Version:**
```cpp
void reset(int fd = -1) {
    if (fd_ >= 0) {
        close(fd_);  // Close current FD
    }
    fd_ = fd;
}

// Or use swap idiom
void reset(int fd = -1) {
    FileDescriptor tmp(fd);
    std::swap(fd_, tmp.fd_);
    // tmp destructor closes old FD
}
```

---

#### Q8
```cpp
class FileDescriptor {
    int fd_;

public:
    FileDescriptor(int fd) : fd_(fd) {}

    ~FileDescriptor() {
        if (fd_ >= 0) {
            close(fd_);
        }
    }

    operator int() const {  // Bug: implicit conversion!
        return fd_;
    }
};

void takes_ownership(int fd) {
    // Closes fd when done
    close(fd);
}

int main() {
    FileDescriptor fd(open("file.txt", O_RDONLY));

    takes_ownership(fd);  // Bug: implicit conversion, silent ownership transfer!

    // Destructor runs - double-close!
}
```

**Answer:**
```
Double-close error (implicit conversion silently transfers ownership)
```

**Explanation:**
- `operator int()` allows implicit conversion to raw FD
- `takes_ownership(fd)` implicitly converts, passes raw FD
- Function closes descriptor
- Destructor also closes → double-close
- Implicit conversions hide ownership transfer
- Caller doesn't realize ownership transferred
- Should use explicit conversion or release() method
- **Key Concept:** Implicit conversion operators on RAII types dangerous; silently convert to raw resources enabling ownership confusion; prefer explicit get() and release() methods; avoid operator T() for resource handles

**Fixed Version:**
```cpp
class FileDescriptor {
    int fd_;

public:
    FileDescriptor(int fd) : fd_(fd) {}

    ~FileDescriptor() {
        if (fd_ >= 0) {
            close(fd_);
        }
    }

    // Explicit getter (no implicit conversion)
    int get() const { return fd_; }

    // Explicit ownership transfer
    int release() {
        int tmp = fd_;
        fd_ = -1;
        return tmp;
    }

    // No operator int() !
};

int main() {
    FileDescriptor fd(open("file.txt", O_RDONLY));

    // takes_ownership(fd);  // Compilation error - can't convert

    takes_ownership(fd.release());  // Explicit ownership transfer - clear intent
}
```

---

#### Q9
```cpp
class FileDescriptor {
    int fd_;

public:
    FileDescriptor(int fd) : fd_(fd) {}

    ~FileDescriptor() {
        if (fd_ >= 0) {
            close(fd_);
        }
    }

    bool is_valid() const {
        return fd_ >= 0;  // Bug: insufficient validation!
    }
};

int main() {
    FileDescriptor fd(99999);  // Bug: arbitrary FD number!

    if (fd.is_valid()) {
        std::cout << "Valid\n";  // Prints "Valid" but FD may not be open!
    }

    // Destructor closes FD 99999 - may close unrelated file!
}
```

**Answer:**
```
Closes unrelated file descriptor (99999 likely belongs to another resource or invalid)
```

**Explanation:**
- Constructor accepts arbitrary FD number without validation
- `is_valid()` only checks if FD >= 0, not if actually open
- FD 99999 may be closed or belong to different resource
- Destructor blindly closes it → may close wrong file or fail
- Should validate FD actually refers to open file (e.g., via fcntl)
- Or enforce construction only through factory functions that open files
- **Key Concept:** Accepting arbitrary file descriptors without validation unsafe; FD may be closed, invalid, or owned elsewhere; validate using fcntl() or restrict construction to factory methods that open resources

**Fixed Version:**
```cpp
class FileDescriptor {
    int fd_;

    // Private constructor
    FileDescriptor(int fd) : fd_(fd) {}

public:
    // Factory methods (only way to create)
    static FileDescriptor open(const char* path, int flags) {
        int fd = ::open(path, flags);
        if (fd < 0) {
            throw std::runtime_error("open() failed");
        }
        return FileDescriptor(fd);
    }

    static FileDescriptor from_fd(int fd) {
        // Validate FD is actually open
        if (fcntl(fd, F_GETFD) < 0) {
            throw std::invalid_argument("FD not open");
        }
        return FileDescriptor(fd);
    }

    ~FileDescriptor() {
        if (fd_ >= 0) {
            close(fd_);
        }
    }

    bool is_valid() const {
        return fd_ >= 0 && fcntl(fd_, F_GETFD) >= 0;
    }
};

int main() {
    // FileDescriptor fd(99999);  // Compilation error - constructor private

    FileDescriptor fd = FileDescriptor::open("file.txt", O_RDONLY);  // Safe
}
```

---

#### Q10
```cpp
class FileDescriptor {
    int fd_;

public:
    FileDescriptor(int fd) : fd_(fd) {}

    ~FileDescriptor() {
        if (fd_ >= 0) {
            close(fd_);
        }
    }

    ssize_t read(void* buf, size_t count) {
        return ::read(fd_, buf, count);  // Bug: not checking EINTR!
    }
};

int main() {
    FileDescriptor fd(open("large_file.txt", O_RDONLY));

    char buffer[1024];
    ssize_t n = fd.read(buffer, sizeof(buffer));  // Bug: may be interrupted by signal!

    if (n < 0) {
        std::cerr << "Read failed\n";  // May be EINTR (not a real error)
    }
}
```

**Answer:**
```
Spurious failure (read() may return -1 with errno=EINTR due to signal interruption)
```

**Explanation:**
- System calls can be interrupted by signals → return -1, set errno to EINTR
- EINTR means "try again", not a real error
- Naive `read()` wrapper propagates EINTR to caller
- Caller may incorrectly treat as fatal error
- Should retry read() on EINTR
- Common pattern in POSIX programming
- **Key Concept:** System calls can be interrupted by signals (EINTR); RAII wrappers should handle EINTR transparently by retrying; exposing EINTR to callers forces error-prone retry logic throughout codebase

**Fixed Version:**
```cpp
ssize_t read(void* buf, size_t count) {
    ssize_t result;
    do {
        result = ::read(fd_, buf, count);
    } while (result < 0 && errno == EINTR);  // Retry on EINTR

    return result;
}

// Similarly for write, close, etc.
void close_internal() {
    int result;
    do {
        result = close(fd_);
    } while (result < 0 && errno == EINTR);

    if (result < 0) {
        // Log error but don't throw (destructor)
        std::cerr << "close() failed: " << strerror(errno) << "\n";
    }
}
```

---
