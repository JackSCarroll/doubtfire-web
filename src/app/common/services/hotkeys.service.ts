import {Injectable} from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import {HotkeysService, HotkeysHelpComponent} from '@ngneat/hotkeys';

interface Hotkey {
  keys: string;
  description: string;
}

@Injectable({
  providedIn: 'root',
})
export class FHotkeysService {
  constructor(
    private hotkeyService: HotkeysService,
    private dialog: MatDialog,
  ) {
    this.hotkeyService.registerHelpModal(() => {
      const ref = this.dialog.open(HotkeysHelpComponent, {
        // width: '250px',
      });
      ref.componentInstance.title = 'Formatif Marking Shortcuts';
      ref.componentInstance.dismiss.subscribe(() => ref.close());
    });
  }

  public registerHotkeys(hotkey: Hotkey, onHotkey) {
    const hotkeys = this.hotkeyService.getHotkeys();

    if (!hotkeys.includes(hotkey)) {
      this.hotkeyService.addShortcut(hotkey).subscribe(() => {
        onHotkey();
      });
    }
  }
}
