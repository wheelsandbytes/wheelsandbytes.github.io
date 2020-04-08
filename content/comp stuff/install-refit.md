---
title: "How to install rEFIt on an external USB drive"
date: 2017-03-12T22:36:50-06:00
draft: false
---

## Basically [this](http://refit.sourceforge.net/doc/c1s1_install.html) with pretty pictures.

### 1. Download rEFIt from [here](http://prdownloads.sourceforge.net/refit/rEFIt-0.14.dmg?download).

![1.png](/6877E00DB45E393FDE8F38EC0A670A57.png)

### 2. Open the disk image.

![2.png](/52D4ADE5798287142226350DA2923791.png )

### 3. Wait, the disk image isn't needed just yet...

### 4. Plug your flash drive in...

![3.jpg](/768E14177194FF140987DAAF8585024B.jpg =525x481)

![4.jpg](/72F4F5D5E5BEECD8C5B678DD450686A4.jpg =525x471)

### 5. Open Terminal

Type `diskutil list` and press enter

Should like something like this:

![5.png](/C9FFC90105180ED0DEB07F12D40A8726.png )

The USB disks are always at the bottom. You can see mine is listed as:

![6.png](/5150BEF93683281F9A4D5AC10F65FCDA.png)

In most cases, the `IDENTIFIER` for your USB flash drive is something else. In my case, it is `disk3`

_Make sure to note your correct `IDENTIFIER`, otherwise u gon erase the wrong disk._

### 6. Erase USB flash drive using Terminal

In Terminal, type `diskutil eraseDisk JHFS+ "USB" GPT /dev/disk3` but replace `disk3` with _your_ `IDENTIFIER`. Press enter. POOF there goes your data.

It gon look like dis:

![7.png](/736FA0785AED8255810DDFD1130A68A6.png )

### 7. Copy the "efi" folder to the USB drive

Recall that our USB flash drive was renamed to `USB` in the erase process.

In Terminal, type `cp -R /Volumes/rEFIt/efi /Volumes/USB` and press enter

Then, `cd /Volumes/USB/efi/refit/` and press enter

Then, `sudo ./enable.sh` and press enter

YOUR PASSWORD AIN'T GONNA SHOW but type it in and press enter anyway. Why? Because UNIX.

Should look like this:

![9.png](/5CBEA4D27E5760D60E6BEACF6ED16465.png)

### Done.

Eject the USB flash drive like you normally would, then reboot your Mac while holding the option key, and you should see rEFIt as an option.

![10.jpg](/9DA93F5484FDF8E1A917B501A018F685.jpg =225x180)

---
Copyright &copy; wheelsandbytes 2015-2019. All Rights Reserved
