import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import PyPDF2
import fitz  # PyMuPDF
from PIL import Image, ImageTk # Pillow for image handling
import time
import threading
import io # For handling image bytes
import json
import os
import platform

# --- Constants ---
SETTINGS_FILE = os.path.join(os.path.expanduser("~"), ".rsvp_reader_settings.json")
DEFAULT_FONT_FAMILY = "Helvetica"
BASE_RSVP_FONT_SIZE = 36 # Base size for RSVP display
PUNCTUATION_PAUSE_MULTIPLIER = 1.3 # Extra delay for punctuation
THUMBNAIL_RESIZE_DEBOUNCE_MS = 250 # Delay for debouncing thumbnail resize

class RSVPApp:
    """
    Advanced Rapid Serial Visual Presentation (RSVP) application
    with side-by-side RSVP and PDF page preview, auto-flipping thumbnail,
    and dynamically fitting thumbnail preview.
    """
    def __init__(self, master):
        self.master = master
        master.title("Advanced RSVP PDF Reader")
        master.geometry("1100x780") 

        # --- RSVP Variables ---
        self.pdf_path = None
        self.pdf_document = None 
        self.words = []
        self.page_word_indices = [] 
        self.current_word_index = 0 
        
        self.is_running = False
        self.is_paused = False
        self.rsvp_thread = None
        self.thumbnail_photo_image = None 
        self._thumbnail_resize_job = None # For debouncing thumbnail resize

        # --- UI Variables ---
        self.wpm_var = tk.IntVar(value=250)
        self.start_page_var = tk.IntVar(value=1) 
        self.current_thumbnail_page_num = tk.IntVar(value=0) 
        self.words_per_step_var = tk.IntVar(value=1)
        self.rsvp_font_size_offset_var = tk.IntVar(value=0) 
        self.current_theme = tk.StringVar(value='light')
        self.last_pdf_directory = tk.StringVar(value=os.path.expanduser("~"))
        self.wpm_entry_var = tk.StringVar() 

        self.load_settings() 

        # --- Theme Setup ---
        self.themes = {
            'light': { 'bg': '#F0F0F0', 'fg': '#000000', 'display_bg': '#FFFFFF', 'display_fg': '#000000',
                       'button_bg': '#E1E1E1', 'button_fg': '#000000', 'button_active_bg': '#C6C6C6',
                       'disabled_fg': '#A0A0A0', 'scale_trough': '#D3D3D3', 'status_bg': '#EAEAEA',
                       'status_fg': '#000000', 'label_bg': '#F0F0F0', 'spin_bg': '#FFFFFF', 'spin_fg': '#000000',
                       'entry_bg': '#FFFFFF', 'entry_fg': '#000000', 'thumbnail_bg': '#CCCCCC', 'thumbnail_fg': '#333333',
                       'progress_trough': '#D3D3D3', 'progress_bar': '#0078D7', 'pane_sash': '#D0D0D0'},
            'dark': { 'bg': '#2E2E2E', 'fg': '#E0E0E0', 'display_bg': '#1E1E1E', 'display_fg': '#FFFFFF',
                      'button_bg': '#555555', 'button_fg': '#FFFFFF', 'button_active_bg': '#777777',
                      'disabled_fg': '#6A6A6A', 'scale_trough': '#444444', 'status_bg': '#3A3A3A',
                      'status_fg': '#E0E0E0', 'label_bg': '#2E2E2E', 'spin_bg': '#3A3A3A', 'spin_fg': '#E0E0E0',
                      'entry_bg': '#3A3A3A', 'entry_fg': '#E0E0E0', 'thumbnail_bg': '#404040', 'thumbnail_fg': '#AAAAAA',
                      'progress_trough': '#444444', 'progress_bar': '#1E90FF', 'pane_sash': '#3A3A3A'}
        }
        self.style = ttk.Style()
        self.style.theme_use('clam') 

        self._build_ui()
        self.apply_theme() 
        self._bind_keyboard_shortcuts()

        self.wpm_entry_var.set(str(self.wpm_var.get()))
        self.wpm_var.trace_add("write", self._update_wpm_entry_from_var)


    def _build_ui(self):
        """Constructs the main UI elements with a PanedWindow for side-by-side view."""
        # Top bar for file selection
        self.file_frame = ttk.Frame(self.master, padding="10")
        self.file_frame.pack(fill=tk.X)
        self.file_label = ttk.Label(self.file_frame, text="No PDF selected")
        self.file_label.pack(side=tk.LEFT, padx=(0, 10), expand=True, fill=tk.X)
        self.browse_button = ttk.Button(self.file_frame, text="Browse PDF (Ctrl+O)", command=self.browse_pdf)
        self.browse_button.pack(side=tk.LEFT)

        # Controls and Settings frames (above the PanedWindow)
        top_controls_frame = ttk.Frame(self.master)
        top_controls_frame.pack(fill=tk.X)

        self.control_frame = ttk.Frame(top_controls_frame, padding="5")
        self.control_frame.pack(fill=tk.X)
        self.prev_word_button = ttk.Button(self.control_frame, text="< Prev (←)", command=self.previous_chunk, state=tk.DISABLED)
        self.prev_word_button.pack(side=tk.LEFT, padx=2)
        self.start_button = ttk.Button(self.control_frame, text="Start (Space)", command=self.start_rsvp, state=tk.DISABLED)
        self.start_button.pack(side=tk.LEFT, padx=2)
        self.pause_button = ttk.Button(self.control_frame, text="Pause (Space)", command=self.pause_rsvp, state=tk.DISABLED)
        self.pause_button.pack(side=tk.LEFT, padx=2)
        self.resume_button = ttk.Button(self.control_frame, text="Resume (Space)", command=self.resume_rsvp, state=tk.DISABLED)
        self.resume_button.pack(side=tk.LEFT, padx=2)
        self.stop_button = ttk.Button(self.control_frame, text="Stop (Esc)", command=self.stop_rsvp, state=tk.DISABLED)
        self.stop_button.pack(side=tk.LEFT, padx=2)
        self.next_word_button = ttk.Button(self.control_frame, text="Next > (→)", command=self.next_chunk, state=tk.DISABLED)
        self.next_word_button.pack(side=tk.LEFT, padx=2)
        self.theme_button = ttk.Button(self.control_frame, text="Theme (Ctrl+T)", command=self.toggle_theme)
        self.theme_button.pack(side=tk.RIGHT, padx=2)


        self.settings_frame = ttk.Frame(top_controls_frame, padding="5")
        self.settings_frame.pack(fill=tk.X, pady=(0,5))
        wpm_sub_frame = ttk.Frame(self.settings_frame)
        wpm_sub_frame.pack(side=tk.LEFT, padx=5, pady=2)
        ttk.Label(wpm_sub_frame, text="WPM (↑↓):").pack(side=tk.LEFT)
        self.wpm_scale = ttk.Scale(wpm_sub_frame, from_=50, to_=1000, variable=self.wpm_var, orient=tk.HORIZONTAL, length=80)
        self.wpm_scale.pack(side=tk.LEFT, padx=(0,2))
        self.wpm_entry = ttk.Entry(wpm_sub_frame, textvariable=self.wpm_entry_var, width=5, justify=tk.RIGHT)
        self.wpm_entry.pack(side=tk.LEFT)
        self.wpm_entry.bind("<Return>", self._update_wpm_from_entry)
        self.wpm_entry.bind("<FocusOut>", self._update_wpm_from_entry)

        ttk.Label(self.settings_frame, text="Start Page:").pack(side=tk.LEFT, padx=(5,0))
        self.start_page_spinbox = ttk.Spinbox(self.settings_frame, from_=1, to=1, textvariable=self.start_page_var, width=4, state=tk.DISABLED, wrap=True, command=self._on_start_page_change)
        self.start_page_spinbox.pack(side=tk.LEFT, padx=(0,5))

        ttk.Label(self.settings_frame, text="Words/Step:").pack(side=tk.LEFT, padx=(5,0))
        self.chunk_size_spinbox = ttk.Spinbox(self.settings_frame, from_=1, to=10, textvariable=self.words_per_step_var, width=3, state=tk.NORMAL, wrap=True, command=self._on_chunk_size_change)
        self.chunk_size_spinbox.pack(side=tk.LEFT, padx=(0,5))

        ttk.Label(self.settings_frame, text="Font Size Adj:").pack(side=tk.LEFT, padx=(5,0))
        self.font_size_spinbox = ttk.Spinbox(self.settings_frame, from_=-10, to=10, textvariable=self.rsvp_font_size_offset_var, width=3, state=tk.NORMAL, wrap=True, command=self._on_font_size_change)
        self.font_size_spinbox.pack(side=tk.LEFT, padx=(0,5))

        # Progress Bar (below settings, above PanedWindow)
        self.progress_bar = ttk.Progressbar(self.master, orient=tk.HORIZONTAL, length=100, mode='determinate', style="Custom.Horizontal.TProgressbar")
        self.progress_bar.pack(fill=tk.X, padx=10, pady=(0,5))
        
        # Main PanedWindow for side-by-side view
        self.main_paned_window = ttk.PanedWindow(self.master, orient=tk.HORIZONTAL) 
        self.main_paned_window.pack(expand=True, fill=tk.BOTH, padx=10, pady=5)

        # Left Pane: RSVP Display
        left_pane_frame = ttk.Frame(self.main_paned_window, padding=0) 
        self.main_paned_window.add(left_pane_frame, weight=2) 

        self.rsvp_frame = ttk.Frame(left_pane_frame, padding="10") 
        self.rsvp_frame.pack(expand=True, fill=tk.BOTH)
        self.current_rsvp_font_size = BASE_RSVP_FONT_SIZE + self.rsvp_font_size_offset_var.get()
        self.word_display_font = (DEFAULT_FONT_FAMILY, self.current_rsvp_font_size, "bold")
        self.word_display = ttk.Label(self.rsvp_frame, text="", font=self.word_display_font, anchor="center", justify=tk.CENTER, style="WordDisplay.TLabel", wraplength=450) 
        self.word_display.pack(expand=True, fill=tk.BOTH)
        self.rsvp_frame.grid_rowconfigure(0, weight=1)
        self.rsvp_frame.grid_columnconfigure(0, weight=1)
        self.word_display.grid(row=0, column=0, sticky="nsew")


        # Right Pane: Thumbnail Preview
        right_pane_frame = ttk.Frame(self.main_paned_window, padding=0)
        self.main_paned_window.add(right_pane_frame, weight=1)

        self.thumbnail_info_frame = ttk.Frame(right_pane_frame, padding="2")
        self.thumbnail_info_frame.pack(fill=tk.X, padx=5, pady=(5,0))
        self.thumbnail_page_label = ttk.Label(self.thumbnail_info_frame, text="Preview: Page -")
        self.thumbnail_page_label.pack(side=tk.LEFT)
        self.reading_page_label = ttk.Label(self.thumbnail_info_frame, text="Reading: Page -")
        self.reading_page_label.pack(side=tk.RIGHT)

        self.thumbnail_frame = ttk.Frame(right_pane_frame, padding="5")
        self.thumbnail_frame.pack(expand=True, fill=tk.BOTH, padx=5, pady=2)
        self.thumbnail_label = ttk.Label(self.thumbnail_frame, text="Page Preview Area", anchor="center", relief=tk.GROOVE, style="Thumbnail.TLabel")
        self.thumbnail_label.pack(expand=True, fill=tk.BOTH) 
        self.thumbnail_label.bind("<Configure>", self._on_thumbnail_label_configure) # Bind resize event


        # Status Bar (at the very bottom)
        self.status_bar = ttk.Label(self.master, text="Ready", relief=tk.SUNKEN, anchor=tk.W, style="StatusBar.TLabel")
        self.status_bar.pack(side=tk.BOTTOM, fill=tk.X)

    # --- Settings Management ---
    def load_settings(self):
        try:
            with open(SETTINGS_FILE, 'r') as f:
                settings = json.load(f)
                self.wpm_var.set(settings.get('wpm', 250))
                self.words_per_step_var.set(settings.get('words_per_step', 1))
                self.last_pdf_directory.set(settings.get('last_pdf_directory', os.path.expanduser("~")))
                self.current_theme.set(settings.get('theme', 'light'))
                self.rsvp_font_size_offset_var.set(settings.get('rsvp_font_size_offset', 0))
        except (FileNotFoundError, json.JSONDecodeError): pass 
        self.wpm_entry_var.set(str(self.wpm_var.get()))

    def save_settings(self, event=None): 
        settings = {
            'wpm': self.wpm_var.get(),
            'words_per_step': self.words_per_step_var.get(),
            'last_pdf_directory': self.last_pdf_directory.get(),
            'theme': self.current_theme.get(),
            'rsvp_font_size_offset': self.rsvp_font_size_offset_var.get()
        }
        try:
            with open(SETTINGS_FILE, 'w') as f: json.dump(settings, f, indent=4)
        except IOError as e: print(f"Error saving settings: {e}")

    # --- Keyboard Shortcuts ---
    def _bind_keyboard_shortcuts(self):
        self.master.bind('<space>', self.handle_space_key)
        self.master.bind('<Escape>', self.handle_escape_key)
        self.master.bind('<Left>', self.handle_left_arrow)
        self.master.bind('<Right>', self.handle_right_arrow)
        self.master.bind('<Up>', self.handle_up_arrow)
        self.master.bind('<Down>', self.handle_down_arrow)
        ctrl_cmd = 'Command' if platform.system() == 'Darwin' else 'Control'
        self.master.bind(f'<{ctrl_cmd}-o>', lambda e: self.browse_pdf())
        self.master.bind(f'<{ctrl_cmd}-O>', lambda e: self.browse_pdf()) 
        self.master.bind(f'<{ctrl_cmd}-t>', lambda e: self.toggle_theme())
        self.master.bind(f'<{ctrl_cmd}-T>', lambda e: self.toggle_theme())

    def handle_space_key(self, event=None):
        if isinstance(self.master.focus_get(), (ttk.Entry, ttk.Spinbox)): return
        if self.is_running:
            if self.is_paused: self.resume_rsvp()
            else: self.pause_rsvp()
        elif self.words: self.start_rsvp()
        return "break"

    def handle_escape_key(self, event=None):
        if self.is_running or self.words: self.stop_rsvp()
        return "break"
    def handle_left_arrow(self, event=None):
        if self.is_paused and self.words: self.previous_chunk()
        return "break"
    def handle_right_arrow(self, event=None):
        if self.is_paused and self.words: self.next_chunk()
        return "break"
    def handle_up_arrow(self, event=None):
        current_wpm = self.wpm_var.get()
        self.wpm_var.set(min(1000, current_wpm + 10))
        return "break"
    def handle_down_arrow(self, event=None):
        current_wpm = self.wpm_var.get()
        self.wpm_var.set(max(50, current_wpm - 10))
        return "break"

    # --- Theme and Font ---
    def apply_theme(self):
        colors = self.themes[self.current_theme.get()]
        self.master.configure(bg=colors['bg'])
        self.style.configure('.', background=colors['bg'], foreground=colors['fg'], fieldbackground=colors['entry_bg'])
        self.style.map('.', foreground=[('disabled', colors['disabled_fg'])])
        self.style.configure('TFrame', background=colors['bg'])
        self.style.configure('TLabel', background=colors['label_bg'], foreground=colors['fg'])
        self.style.configure('TButton', background=colors['button_bg'], foreground=colors['button_fg'], relief=tk.RAISED, borderwidth=1, padding=5)
        self.style.map('TButton', background=[('active', colors['button_active_bg']), ('!disabled', colors['button_bg'])], foreground=[('!disabled', colors['button_fg'])], relief=[('pressed', tk.SUNKEN), ('!pressed', tk.RAISED)])
        self.style.configure('Horizontal.TScale', background=colors['bg'], troughcolor=colors['scale_trough'])
        self.style.configure('TSpinbox', fieldbackground=colors['spin_bg'], foreground=colors['spin_fg'], arrowcolor=colors['fg'])
        self.style.map('TSpinbox', fieldbackground=[('readonly', colors['bg']), ('disabled', colors['bg'])])
        self.style.configure('TEntry', fieldbackground=colors['entry_bg'], foreground=colors['entry_fg'])
        self.style.map('TEntry', foreground=[('disabled', colors['disabled_fg'])])
        
        self.current_rsvp_font_size = BASE_RSVP_FONT_SIZE + self.rsvp_font_size_offset_var.get()
        self.word_display_font = (DEFAULT_FONT_FAMILY, self.current_rsvp_font_size, "bold")
        self.style.configure('WordDisplay.TLabel', background=colors['display_bg'], foreground=colors['display_fg'], font=self.word_display_font)
        
        self.style.configure('StatusBar.TLabel', background=colors['status_bg'], foreground=colors['status_fg'], relief=tk.SUNKEN, padding=(5,2))
        self.style.configure("Thumbnail.TLabel", background=colors['thumbnail_bg'], foreground=colors['thumbnail_fg'], relief=tk.GROOVE)
        self.style.configure("Custom.Horizontal.TProgressbar", troughcolor=colors['progress_trough'], background=colors['progress_bar'])
        
        self.style.configure("TPanedwindow", background=colors['bg']) 
        self.style.configure("TPanedwindow.Sash", background=colors['pane_sash'], relief=tk.RAISED, borderwidth=1, lightcolor=colors['pane_sash'], darkcolor=colors['pane_sash'], sashthickness=6)


        self.thumbnail_label.configure(text="Page Preview Area" if self.thumbnail_photo_image is None else "")
        self.file_label.configure(background=colors['label_bg'], foreground=colors['fg'])
        self.thumbnail_page_label.configure(background=colors['label_bg'], foreground=colors['fg'])
        self.reading_page_label.configure(background=colors['label_bg'], foreground=colors['fg'])
        
        self._update_button_states()
        self.master.update_idletasks()

    def toggle_theme(self):
        self.current_theme.set('dark' if self.current_theme.get() == 'light' else 'light')
        self.apply_theme()
        self.save_settings()

    def _on_font_size_change(self):
        self.current_rsvp_font_size = BASE_RSVP_FONT_SIZE + self.rsvp_font_size_offset_var.get()
        self.word_display_font = (DEFAULT_FONT_FAMILY, self.current_rsvp_font_size, "bold")
        self.word_display.config(font=self.word_display_font) 
        self.style.configure('WordDisplay.TLabel', font=self.word_display_font) 
        self.save_settings()

    def _update_wpm_entry_from_var(self, *args):
        self.wpm_entry_var.set(str(self.wpm_var.get()))
    def _update_wpm_from_entry(self, event=None):
        try:
            val = int(self.wpm_entry_var.get())
            if 50 <= val <= 1000: self.wpm_var.set(val)
            else: self.wpm_entry_var.set(str(self.wpm_var.get()))
        except ValueError: self.wpm_entry_var.set(str(self.wpm_var.get()))
        self.save_settings()

    # --- PDF and RSVP Logic ---
    def _on_thumbnail_label_configure(self, event=None):
        """Handles resize of the thumbnail label to redraw the thumbnail."""
        if self._thumbnail_resize_job:
            self.master.after_cancel(self._thumbnail_resize_job)
        
        self._thumbnail_resize_job = self.master.after(THUMBNAIL_RESIZE_DEBOUNCE_MS, self._redraw_current_thumbnail)

    def _redraw_current_thumbnail(self):
        """Redraws the thumbnail for the currently active/previewed page."""
        if self.pdf_document:
            page_to_draw = self.current_thumbnail_page_num.get()
            if page_to_draw <= 0 and self.pdf_document.page_count > 0 : # If not set, default to 1
                page_to_draw = 1
            
            if page_to_draw > 0:
                 self.update_thumbnail(page_to_draw)


    def _on_start_page_change(self): 
        if self.pdf_document and not self.is_running: 
            try:
                page_num_to_preview = self.start_page_var.get()
                self.update_thumbnail(page_num_to_preview) 
                if self.is_paused and self.words:
                    target_page_idx = page_num_to_preview - 1
                    if 0 <= target_page_idx < len(self.page_word_indices):
                        self.current_word_index = self.page_word_indices[target_page_idx]
                    else: 
                        self.current_word_index = self.page_word_indices[-1] if self.page_word_indices else 0
                    self.master.after(0, self._display_current_chunk) 
                self._update_button_states()
            except tk.TclError: pass 
            except Exception as e: print(f"Error in _on_start_page_change: {e}")
    
    def _on_chunk_size_change(self):
        if not 1 <= self.words_per_step_var.get() <=10:
            self.words_per_step_var.set(max(1, min(self.words_per_step_var.get(),10)))
        
        if self.is_paused and self.words:
            self.master.after(0, self._display_current_chunk)
            self._update_button_states() 
        
        self.save_settings()

    def update_thumbnail(self, page_number_to_display):
        self.current_thumbnail_page_num.set(page_number_to_display) 
        self.thumbnail_page_label.config(text=f"Preview: Page {page_number_to_display}")

        if not self.pdf_document:
            self.thumbnail_label.config(image='', text="Load PDF for Preview")
            self.thumbnail_photo_image = None; self.apply_theme(); return
        try:
            page_num_0_indexed = page_number_to_display - 1
            if 0 <= page_num_0_indexed < self.pdf_document.page_count:
                page = self.pdf_document.load_page(page_num_0_indexed)
                
                # Get available space in the label
                label_width = self.thumbnail_label.winfo_width()
                label_height = self.thumbnail_label.winfo_height()
                padding = 10 
                target_width = max(1, label_width - padding)
                target_height = max(1, label_height - padding)

                if target_width <= 1 or target_height <= 1: # Widget not yet sized
                    target_width = 200 
                    target_height = 280 # Adjusted for typical PDF page aspect ratio

                page_rect = page.rect
                page_width = page_rect.width
                page_height = page_rect.height

                if page_width <= 0 or page_height <= 0:
                    self.thumbnail_label.config(image='', text="Invalid Page Dims")
                    self.thumbnail_photo_image = None; self.apply_theme(); return

                zoom_x = target_width / page_width
                zoom_y = target_height / page_height
                zoom_factor = min(zoom_x, zoom_y)
                zoom_factor = max(0.01, zoom_factor) 

                matrix = fitz.Matrix(zoom_factor, zoom_factor)
                pix = page.get_pixmap(matrix=matrix, alpha=False)
                img_bytes = pix.tobytes("ppm")
                pil_image = Image.open(io.BytesIO(img_bytes))
                self.thumbnail_photo_image = ImageTk.PhotoImage(pil_image)
                self.thumbnail_label.config(image=self.thumbnail_photo_image, text="")
            else:
                self.thumbnail_label.config(image='', text=f"Page {page_number_to_display} N/A")
                self.thumbnail_photo_image = None; self.apply_theme()
        except Exception as e:
            # print(f"Error generating thumbnail for page {page_number_to_display}: {e}") # For debugging
            self.thumbnail_label.config(image='', text="Preview Error")
            self.thumbnail_photo_image = None; self.apply_theme()

    def browse_pdf(self):
        if self.pdf_document: self.pdf_document.close(); self.pdf_document = None
        path = filedialog.askopenfilename(title="Select a PDF file", filetypes=(("PDF files", "*.pdf"), ("All files", "*.*")), initialdir=self.last_pdf_directory.get())
        if path:
            self.pdf_path = path
            self.last_pdf_directory.set(os.path.dirname(path)); self.save_settings()
            self.file_label.config(text=os.path.basename(self.pdf_path))
            self.status_bar.config(text=f"Loading {os.path.basename(self.pdf_path)}...")
            self.master.update_idletasks()
            try: self.pdf_document = fitz.open(self.pdf_path)
            except Exception as e: messagebox.showerror("PDF Error", f"Could not open PDF: {e}"); self._clear_pdf_data(); return
            
            num_pages_loaded = self.load_text_from_pdf()
            if num_pages_loaded > 0:
                self.status_bar.config(text=f"PDF Loaded: {len(self.words)} words, {num_pages_loaded} pages. Ready.")
                self.start_page_spinbox.config(from_=1, to=max(1, num_pages_loaded), state=tk.NORMAL)
            elif self.pdf_document:
                self.status_bar.config(text=f"PDF opened ({self.pdf_document.page_count} pages). Text extraction poor/failed.")
                self.start_page_spinbox.config(from_=1, to=max(1, self.pdf_document.page_count), state=tk.NORMAL)
            else: self.file_label.config(text="Failed to load PDF"); self._clear_pdf_data(); return

            self.start_page_var.set(1) 
            # Call update_idletasks to ensure winfo_width/height are available for first thumbnail
            self.master.update_idletasks() 
            self.update_thumbnail(1)   
            self._update_button_states()
            self.master.after(0, self._display_current_chunk)
            self.start_button.focus_set()

    def _clear_pdf_data(self):
        self.words = []; self.page_word_indices = []; self.current_word_index = 0
        self.start_page_spinbox.config(from_=1, to=1, state=tk.DISABLED)
        self.start_page_var.set(1)
        self.current_thumbnail_page_num.set(0)
        if self.pdf_document: self.pdf_document.close(); self.pdf_document = None
        self.pdf_path = None
        self.file_label.config(text="No PDF selected")
        self.thumbnail_label.config(image='', text="Page Preview Area")
        self.thumbnail_page_label.config(text="Preview: Page -")
        self.reading_page_label.config(text="Reading: Page -")
        self.thumbnail_photo_image = None; self.apply_theme()
        self.progress_bar['value'] = 0
        self._update_button_states()
        self.master.after(0, self._display_current_chunk)

    def load_text_from_pdf(self):
        if not self.pdf_path: return 0
        self.words = []; self.page_word_indices = []; self.current_word_index = 0
        num_pages_pypdf2 = 0
        try:
            with open(self.pdf_path, 'rb') as pypdf2_file:
                reader = PyPDF2.PdfReader(pypdf2_file)
                num_pages_pypdf2 = len(reader.pages)
                if reader.is_encrypted:
                    try: reader.decrypt('')
                    except Exception: messagebox.showwarning("PDF Warning", "Could not decrypt PDF for text. Thumbnails may work.")
                current_total_words = 0
                for page_num in range(num_pages_pypdf2):
                    self.page_word_indices.append(current_total_words)
                    page = reader.pages[page_num]
                    extracted_page_text = page.extract_text()
                    if extracted_page_text:
                        page_words = extracted_page_text.split()
                        self.words.extend(page_words)
                        current_total_words += len(page_words)
            
            if not self.words and num_pages_pypdf2 > 0 and self.pdf_document:
                 self.status_bar.config(text=f"PDF has {self.pdf_document.page_count} pages, but text extraction was poor.")
            return num_pages_pypdf2
        except PyPDF2.errors.PdfReadError as e:
            messagebox.showwarning("PyPDF2 Error", f"PyPDF2 error reading PDF for text: {e}. Thumbnails may work.")
            return 0
        except Exception as e: messagebox.showerror("Text Extraction Error", f"Unexpected error: {e}"); return 0


    def _rsvp_loop(self):
        while self.is_running and self.current_word_index < len(self.words):
            if self.is_paused: time.sleep(0.1); continue
            chunk_to_display, num_words_in_chunk = self._get_current_chunk_data()
            if not chunk_to_display: break 
            self.master.after(0, self._display_current_chunk) 
            current_wpm = self.wpm_var.get()
            if current_wpm <= 0: current_wpm = 1 
            base_delay_per_chunk = (60.0 / current_wpm) * num_words_in_chunk
            actual_delay = base_delay_per_chunk
            if num_words_in_chunk > 0:
                last_word_in_chunk = chunk_to_display[-1]
                if last_word_in_chunk and last_word_in_chunk[-1] in ['.','!','?']:
                    actual_delay *= PUNCTUATION_PAUSE_MULTIPLIER
            time.sleep(max(0.05, actual_delay))
            if self.is_running and not self.is_paused :
                self.current_word_index += num_words_in_chunk
        if self.is_running: 
            self.master.after(0, self._display_current_chunk) 
            if self.current_word_index >= len(self.words):
                 self.master.after(0, self.status_bar.config, {'text': "Finished reading PDF."})
                 self.master.after(0, lambda: self.start_button.config(text="Read Again? (Space)"))
            self.master.after(0, self._reset_rsvp_state, True)


    def _get_current_chunk_data(self):
        if not self.words or not (0 <= self.current_word_index < len(self.words)):
            return [], 0
        chunk_size = self.words_per_step_var.get()
        if chunk_size <= 0: chunk_size = 1
        start_idx = self.current_word_index
        end_idx = min(len(self.words), start_idx + chunk_size)
        actual_chunk_words = self.words[start_idx:end_idx]
        num_words_in_chunk = len(actual_chunk_words)
        return actual_chunk_words, num_words_in_chunk

    def _display_current_chunk(self):
        current_reading_page = 1
        if self.words and self.page_word_indices:
            for i, page_start_idx in enumerate(self.page_word_indices):
                if self.current_word_index >= page_start_idx:
                    current_reading_page = i + 1
                else: break
        self.reading_page_label.config(text=f"Reading: Page {current_reading_page if self.words else '-'}")

        if self.pdf_document and current_reading_page != self.current_thumbnail_page_num.get():
            if self.is_running or self.is_paused : 
                self.update_thumbnail(current_reading_page)
                self.start_page_var.set(current_reading_page) 

        if not self.words:
            self.word_display.config(text="")
            self.status_bar.config(text="No PDF loaded or no text.")
            self.progress_bar['value'] = 0; return

        actual_chunk_words, num_words_in_chunk = self._get_current_chunk_data()
        if num_words_in_chunk > 0:
            display_text = " ".join(actual_chunk_words)
            self.word_display.config(text=display_text)
            start_display_idx = self.current_word_index + 1
            end_display_idx = self.current_word_index + num_words_in_chunk
            status_text = f"Words {start_display_idx}-{end_display_idx}/{len(self.words)}"
            self.status_bar.config(text=status_text)
            self.progress_bar['value'] = (end_display_idx / len(self.words)) * 100 if len(self.words) > 0 else 0
        elif self.current_word_index >= len(self.words) and len(self.words) > 0:
            self.word_display.config(text="Done!")
            self.status_bar.config(text=f"Finished. (Word {len(self.words)}/{len(self.words)})")
            self.progress_bar['value'] = 100
        else: 
            self.word_display.config(text="")
            status_default = "Ready."
            if self.words: status_default = f"Ready. (Word {self.current_word_index + 1}/{len(self.words)})"
            self.status_bar.config(text=status_default)
            self.progress_bar['value'] = (self.current_word_index / len(self.words)) * 100 if self.words else 0

    def start_rsvp(self):
        if not self.words: messagebox.showinfo("Info", "No text. Cannot start RSVP."); return
        if self.start_button.cget("text") == "Read Again? (Space)":
            self.current_word_index = 0
            self.start_page_var.set(1)
            self.update_thumbnail(1) 
            self.start_button.config(text="Start (Space)") 
        if self.is_running and self.rsvp_thread and self.rsvp_thread.is_alive():
            self.is_running = False
            try: self.rsvp_thread.join(timeout=0.5)
            except RuntimeError: pass
        try:
            target_page = self.start_page_var.get()
            if self.page_word_indices and 1 <= target_page <= len(self.page_word_indices):
                self.current_word_index = self.page_word_indices[target_page - 1]
            self.current_word_index = max(0, min(self.current_word_index, len(self.words) -1 if self.words else 0))
        except tk.TclError: self.current_word_index = 0
        if self.current_word_index >= len(self.words) and len(self.words) > 0 :
            messagebox.showinfo("Info", "Start page selection is beyond available text content.")
            self.current_word_index = self.page_word_indices[-1] if self.page_word_indices else 0
            if self.words: self.current_word_index = min(self.current_word_index, len(self.words)-1)
            else: self.current_word_index = 0
            self.master.after(0, self._display_current_chunk)
            self._update_button_states(); return
        self.is_running = True; self.is_paused = False
        self.master.after(0, self._display_current_chunk)
        self._update_button_states()
        self.rsvp_thread = threading.Thread(target=self._rsvp_loop, daemon=True)
        self.rsvp_thread.start()

    def pause_rsvp(self):
        if self.is_running and not self.is_paused:
            self.is_paused = True
            self.status_bar.config(text="RSVP paused.")
            self._update_button_states()
            self.master.after(0, self._display_current_chunk)

    def resume_rsvp(self):
        if self.is_running and self.is_paused:
            self.is_paused = False
            self.status_bar.config(text="RSVP resumed.")
            self._update_button_states()

    def stop_rsvp(self):
        self._reset_rsvp_state(finished=False)

    def _reset_rsvp_state(self, finished=False):
        was_running = self.is_running
        self.is_running = False; self.is_paused = False
        if not finished:
            self.current_word_index = 0 
            if self.pdf_document: self.start_page_var.set(1) 
            self.status_bar.config(text="RSVP stopped. Ready.")
            self.start_button.config(text="Start (Space)") 
        self.master.after(0, self._display_current_chunk) 
        self._update_button_states()
        if self.pdf_document and not was_running and not finished : 
            self.update_thumbnail(self.start_page_var.get())


    def previous_chunk(self):
        if self.is_paused and self.words:
            chunk_size = self.words_per_step_var.get()
            if chunk_size <= 0: chunk_size = 1
            self.current_word_index = max(0, self.current_word_index - chunk_size)
            self.master.after(0, self._display_current_chunk)
            self._update_button_states()

    def next_chunk(self):
        if self.is_paused and self.words:
            current_chunk_words, num_words_in_current_chunk = self._get_current_chunk_data()
            if self.current_word_index + num_words_in_current_chunk < len(self.words):
                self.current_word_index += num_words_in_current_chunk
            self.master.after(0, self._display_current_chunk)
            self._update_button_states()

    def _update_button_states(self):
        has_text_content = bool(self.words)
        pdf_is_open = bool(self.pdf_document)
        prev_chunk_state = tk.DISABLED
        next_chunk_state = tk.DISABLED

        if self.is_running:
            if self.start_button.cget("text") == "Read Again? (Space)" and not self.is_paused:
                 self.start_button.config(text="Start (Space)", state=tk.DISABLED)
            else: self.start_button.config(state=tk.DISABLED)
            
            self.browse_button.config(state=tk.DISABLED)
            self.wpm_scale.config(state=tk.NORMAL); self.wpm_entry.config(state=tk.NORMAL)
            self.start_page_spinbox.config(state=tk.DISABLED)
            
            # Allow dynamic changes while running
            self.chunk_size_spinbox.config(state=tk.NORMAL) 
            self.font_size_spinbox.config(state=tk.NORMAL)
            
            if self.is_paused:
                self.pause_button.config(state=tk.DISABLED)
                self.resume_button.config(state=tk.NORMAL)
                if has_text_content:
                    prev_chunk_state = tk.NORMAL if self.current_word_index > 0 else tk.DISABLED
                    _ , num_in_curr_chunk = self._get_current_chunk_data()
                    next_chunk_state = tk.NORMAL if self.current_word_index + num_in_curr_chunk < len(self.words) else tk.DISABLED
            else: # Running but not paused
                self.pause_button.config(state=tk.NORMAL)
                self.resume_button.config(state=tk.DISABLED)
            self.stop_button.config(state=tk.NORMAL)
        else: # Not running
            if self.start_button.cget("text") != "Read Again? (Space)": 
                self.start_button.config(state=tk.NORMAL if has_text_content else tk.DISABLED)
            else: self.start_button.config(state=tk.NORMAL if has_text_content else tk.DISABLED)
            
            self.pause_button.config(state=tk.DISABLED); self.resume_button.config(state=tk.DISABLED)
            self.stop_button.config(state=tk.NORMAL if (has_text_content or pdf_is_open) else tk.DISABLED)
            self.browse_button.config(state=tk.NORMAL)
            self.wpm_scale.config(state=tk.NORMAL); self.wpm_entry.config(state=tk.NORMAL)
            self.start_page_spinbox.config(state=tk.NORMAL if pdf_is_open else tk.DISABLED)
            self.chunk_size_spinbox.config(state=tk.NORMAL)
            self.font_size_spinbox.config(state=tk.NORMAL)
            
        self.prev_word_button.config(state=prev_chunk_state)
        self.next_word_button.config(state=next_chunk_state)

    def on_closing(self):
        self.save_settings() 
        if self.is_running: self.is_running = False 
        if self.pdf_document: self.pdf_document.close()
        self.master.destroy()

if __name__ == "__main__":
    root = tk.Tk()
    app = RSVPApp(root)
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    root.mainloop()
