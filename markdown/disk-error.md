

# MacBookAir6,1 disk I/O error...and how I fixed it

## I'm usually up late, so this is normal:

![Alt text](img/disk-error-mba/problem1.jpg)

#### It's late? Only 12:45am haha

![Alt text](img/disk-error-mba/yaoming.png)

![Alt text](img/disk-error-mba/problem2.jpg)

![Alt text](img/disk-error-mba/challengeaccepted.jpg)

#### Alright, so let's use verbose mode to figure out what's going on. OS X is pretty descriptive with a little `-v` magic.

![Alt text](img/disk-error-mba/errors1.jpg)

![Alt text](img/disk-error-mba/pokerface.jpg)

![Alt text](img/disk-error-mba/errors2.jpg)

![Alt text](img/disk-error-mba/surprisedface.jpg)



I've never seen this before. Let's try single user mode and `fsck -fy /`

![Alt text](img/disk-error-mba/fsck1.jpg)

#### `** The voume Macintosh HD could not be verified completely.`

![Alt text](img/disk-error-mba/pokerface.jpg)

It's worth noting that `fsck -drfy /` wasn't able to do anything either.

Time to bring out the El Capitan installer disk. Thanks to [DiskMaker X](http://diskmakerx.com), we had the installer running shortly:

![Alt text](img/disk-error-mba/installer1.jpg)

#### Attempting to run First Aid using Disk Utility proved absolutely *worthless*

![Alt text](img/disk-error-mba/firstaid1.jpg)

![Alt text](img/disk-error-mba/deskflip1.png)

This tool used to be so good and reliable... Anyway, looks like a hardware issue with the internal SSD. I really hope not...but always assume the worst.

#### Let's see if the filesystem is still readable...

![Alt text](img/disk-error-mba/accessiblefs1.jpg)

#### Oh good, it looks like we can read the files. Yay! You won't lose anything!

![Alt text](img/disk-error-mba/kittehsmile.jpg)

#### Took the computer home, busted out `cp -R` and within about an hour had everything backed up.

![Alt text](img/disk-error-mba/copyfiles1.jpg)

![Alt text](img/disk-error-mba/copyfiles2.jpg)

![Alt text](img/disk-error-mba/thumbsup.jpg)

## Time to experiment

![Alt text](img/disk-error-mba/installer2.jpg)

![Alt text](img/disk-error-mba/installer3.jpg)

Let's give `fsck_hfs -fy /dev/disk0s2` a shot and see what it says:

![Alt text](img/disk-error-mba/machd1.jpg)

#### This was expected. Wipe it with `diskutil eraseDisk jhfs+ "MACHD" /dev/disk0`

![Alt text](img/disk-error-mba/machd2.jpg)

#### ...is there hope?

![Alt text](img/disk-error-mba/machdinstall1.jpg)

![Alt text](img/disk-error-mba/installfailed1.jpg)

![Alt text](img/disk-error-mba/installfailed2.jpg)

![Alt text](img/disk-error-mba/installfailed3.jpg)

![Alt text](img/disk-error-mba/computerstare.jpg)

![Alt text](img/disk-error-mba/errors3.jpg)

![Alt text](img/disk-error-mba/areyoukiddingme.jpg)

![Alt text](img/disk-error-mba/fsck2.jpg)

![Alt text](img/disk-error-mba/facepalm.jpg)

![Alt text](img/disk-error-mba/whyyy.jpg)

#### Apple diagnostics?

![Alt text](img/disk-error-mba/diagnostic1.jpg)

![Alt text](img/disk-error-mba/diagnostic2.jpg)

![Alt text](img/disk-error-mba/noissuefound.png)

![Alt text](img/disk-error-mba/doublefacepalm.png)

![Alt text](img/disk-error-mba/deskflip1.png)

#### Wiping it with `diskutil` didn't help, so let's give Gparted a go.

![Alt text](img/disk-error-mba/gparted1.jpg)

#### Boots right up with no problem. EFI ftw.

![Alt text](img/disk-error-mba/gparted2.jpg)

#### Created a completely new GPT setup. Attempting to install OS X again:

![Alt text](img/disk-error-mba/attempt1.jpg)

#### Left the apartment for 3 hours and came back to this:

![Alt text](img/disk-error-mba/attempt2.jpg)

![Alt text](img/disk-error-mba/questioning.jpg)

#### Reboot with `-v` aaaaaaand

![Alt text](img/disk-error-mba/attempt3.jpg)

![Alt text](img/disk-error-mba/deskflip2.gif)

![Alt text](img/disk-error-mba/sadsitting.jpg)

#### I'm about to give up and call it a hardware issue.

## Hold on...

There is one thing I have never tried on a disk... *zeroing*

##### Hmm...

Pulled the SSD from my MacBook Pro because the Terminal on the installer is annoying:

![Alt text](img/disk-error-mba/ssdrescue1.jpg)

![Alt text](img/disk-error-mba/ssdrescue2.jpg)

#### *Never tried this before...*

![Alt text](img/disk-error-mba/zerodisk1.jpg)

#### Almost done...

![Alt text](img/disk-error-mba/zerodisk2.jpg)

#### Okay, so now it should be completely blank, no data whatsoever. Repartitioning the disk with `diskutil partitionDisk` and repairing with `diskutil repairDisk` now...

![Alt text](img/disk-error-mba/repairdisk1.jpg)

#### The issue was repairing the volume from before, so we'll try that next with `diskutil repairVolume /dev/disk0s2`:

![Alt text](img/disk-error-mba/repairvolume1.jpg)

![Alt text](img/disk-error-mba/surprisedcat1.jpg)

NO ERROR. Final attempt at installing the system:

![Alt text](img/disk-error-mba/finalinstall1.jpg)

![Alt text](img/disk-error-mba/surprisedcat1.jpg)

![Alt text](img/disk-error-mba/finalinstall2.jpg)

![Alt text](img/disk-error-mba/surprisedcat1.jpg)

![Alt text](img/disk-error-mba/finalinstall3.jpg)

![Alt text](img/disk-error-mba/surprisedcat1.jpg)

![Alt text](img/disk-error-mba/finalinstall4.jpg)

![Alt text](img/disk-error-mba/gasp.gif)

![Alt text](img/disk-error-mba/done.jpg)

![Alt text](img/disk-error-mba/effyeah.png)

## *Never give up.*