---
title: "MBP8,2 Dead GPU"
date: 2017-02-17T00:00:00-00:00
draft: false
---

## So I'm sitting in class,

 setting Windows up to run in VirtualBox off my second internal SSD. VirtualBox did not give me any issues. The next step is to reboot and make sure it is still able to boot up natively. So I shut it down and prepare to go home.

I get home and...

![1.jpg](/E89319C2EA68CA78D583E2AB048B7F98.jpg)

![2.jpg](/D7D523F2264149D32E5676354F418BDC.jpg)

![3.jpg](/BAB95426821948A73ED4E18D13917131.jpg)

![staring.png](/3CDEBEB37071F7D175DA75A181FD2EBC.png)

![4.jpg](/96334635520F7F6D0AB05ABB956FC290.jpg)

_IT WAS WORKING 20 MINUTES AGO_

![jackie-chan.png](/3FBE42A718E5751EF98E507996C6FB26.png)

![questioning.png](/19F5F29EBFCA727500DE29D18600F2D0.png)

Maybe the NVRAM forgot what needs to be booted. Time to give it a kick in the pants:

![5.jpg](/9CE69895960C03070465523D5EF74025.jpg)

Holding Option, we get the usual array of what is to be expected:

![6.jpg](/FBA9146B8BDD1193F8FAC8C414BBA806.jpg)

Odd, my usual SSD custom icons are not showing...already suspicious. Selecting Macintosh HD yields:

![7.jpg](/E0E1BBDB61D22E411A679C6BA43118FC.jpg)

![staring.png](/3CDEBEB37071F7D175DA75A181FD2EBC.png)

_AAAAAAAAAAND we're stuck again...._

![y-u-no-boot.png](/22D85B0BCA6DD77F4D1CEF237D645461.png)

Reboot again with attempt at verbose mode:

![9.jpg](/16E1377A5E5002801D326B143515E2F5.jpg)

![10.jpg](/87DF67BD42A0BD2793CA19059A4CB9B6.jpg)

![cereal-guy.png](/A94068031E58C8A52B662E825E38B1B7.png)

**_What in the world..._**

![staring.png](/3CDEBEB37071F7D175DA75A181FD2EBC.png)

![12.jpg](/6CE33B3FAB2EA16D3BD195726300A461.jpg)

_So instead of a white screen, we get a black screen..._

![double-facepalm.png](/09041C870477F0FBC825C205D016CE35.png)

Recovery mode?

![13.jpg](/2D8C7576B791E61624606B7A8FCB77CD.jpg)

![16.jpg](/EA68798453342AD380515A6C5D7B0F98.jpg)

![staring.png](/3CDEBEB37071F7D175DA75A181FD2EBC.png)

_Alright, no recovery mode either then..._

Next step....uh... El Capitan installer?

![17.jpg](/6646141F499DD1FFCE8A9AAFC8C5F95E.jpg)

![swiss.png](/5BCA6CDB6FFE3192DFAC564AF860B653.png)

![close-enough.png](/DE6AEA2419514C45194A7A527A604DBB.png)

![18.jpg](/B08C9D1D4F32463482998C8E97C246BB.jpg)

![19.jpg](/BC20ABE9D2A78671A071E4BF49049240.jpg)

![20.jpg](/F1116E83E26ADEE5813152684A3ECF28.jpg)

_FANTASTIC_, a white screen again.

![dark-stare.png](/7BCB9789ED3CDEE6224A8BE2FFA81EC4.png)

Welp... gonna try the installer in safe boot:

![21.jpg](/A016B126E15A78D0BDB52BDB7F2D232C.jpg)

![22.jpg](/900C8BC4A0EBB1C9A1CF1DE914E6462D.jpg)

![24.jpg](/E655E38F744ECD52BFDE09CAB309C2FD.jpg)

![suspicious.jpg](/4ECD44FAFF9F1D57557110748E2AB699.jpg)

**_Diagnostics???_**

![25.jpg](/BFE04F12F8FB8EB9F3BB68BC2CA7CBC0.jpg)

![3.jpg](/BAB95426821948A73ED4E18D13917131.jpg)

![deskflip-pokemon-card.jpg](/2B91E2922EB869768ACB734977D76B45.jpg)

I shall give the installer one more chance in Safe Boot:

![29.jpg](/1E18EE6495900F4923CC9E3D972F8E59.jpg)

![30.jpg](/7482C07FEC7575DAB474AD3A726ADDA1.jpg)

![kernel-panic.png](/4B4B0516C9C5BDC08B97828008B68309.png)

What happens if we try to boot Windows?

![31.jpg](/583D53E85A768B1C35CB63A435715F47.jpg)

![32.jpg](/067B60E7CA85B0D872A30AA71A9C6A32.jpg)

![33.jpg](/58D6B40CFCF2F3A221D0BA9C9AA07069.jpg)

![computer-slice.png](/5295E75A9C2741C8AB9A4E3C4424FB76.png)

Nope. How about booting my SSD from USB?

![34.jpg](/A8C59D8252A88C1A7D70C17E95B5180B.jpg)

![35.jpg](/88DB9465EAE9E5A33A64261EFCE485E6.jpg)

![36.jpg](/87B24FA4B2BAEEA82DCBF765ED695708.jpg)

![37.jpg](/66A23D2932F538EA0D5BB87333E3D58E.jpg)

![38.jpg](/2C6854A1F010A8DF5B5FAD3AEA4AE5DC.jpg)

![39.jpg](/C5DCD0D26A397D65C3994A1D8747D1CE.jpg)

![40.jpg](/9461ABDA38542BA64FAAFCC0742E4740.jpg)

![41.jpg](/673016A9AF0ADE30EA3E384A32AD899B.jpg)

![42.jpg](/EEF1060EF0F55018306ED7623E6EEFCF.jpg)

## Okay, _now_ we are getting somewhere. The issue appears to video related. Faulty AMD GPU possibly?

## Context
 This MacBook Pro has two GPUs, an Intel HD 3000 and an AMD 6490M. This generation of dual-GPU MacBooks defaults to the AMD card on boot up. This means that the firmware has the 6490M already selected before any OS starts up. Now, if the 6490M is in fact busted, then I have to find a way to fall back on the Intel HD graphics for the time being. That will be tough, since I have no idea how the PCI graphics controller works on this machine. [On my old MBP5,1](../win7efi/win7efi.html) it was rather straightforward, since the active GPU was simply the last active GPU when the computer was shut down. Plus, I had the ability to control which GPU was selected through the gpu-power-prefs NVRAM variable. Having done some digging using the rEFIt shell on this machine, I cannot find such a variable. I guess that would make sense, considering the hardware is designed to switch GPUs on the fly with no interruption in video output. There appears to be no explicit setting for power to either GPU (and obviously the Intel GPU is always  powered, it is integrated into the CPU).

Screenshots of my rEFIt shenanigans:

![43.jpg](/50DD7F0454A39940B2A3ACA7993F8E42.jpg)

![44.jpg](/07177490909485A61E493CD8771A8A87.jpg)

![45.jpg](/B7FC2D6261E21E49D615C7F456B41011.jpg)

![46.jpg](/8D29A6534913032B0DB9EB088A00144A.jpg)

![47.jpg](/B2B4F81D7CF8A6A048FE637A9A713BCC.jpg)

![48.jpg](/71B5619856B52473E32002236438E96A.jpg)

![49.jpg](/CB8668702F376E15F4C6C8EB975A12CB.jpg)

There is no `gpu-power-prefs` variable, and I really do not feel like studying the hex dump for `GraphicsOutput` xD

Let us see if Apple has us covered...

![50.jpg](/2563630F182640AD663FC7B2644366D0.jpg)

![51.jpg](/782377DE5CBD8D9A9B8754C07DBFA3B9.jpg)

![52.jpg](/93A493C5399119F47F0DE33B3472473E.jpg)

![happy.png](/A6EFDE32A9E16A087C2AF06ACD0F15B8.png)

_Awwww yeah._ Time to get it ready for shipping!

![59.jpg](/9A27CA404C60D31C482B007D144AE8F8.jpg)

Pulling the main SSD first so I can keep using my system on another Mac...

![53.jpg](/0C5AC24725C5CC9CB7F325B521508293.jpg)

![54.jpg](/46DA8ADBCADE4318C7F89EE26AE2EFA5.jpg)

![55.jpg](/BAD2F95BE56C10201BCD480022736CC9.jpg)

Wiped and ready for packaging!

![56.jpg](/36B71BBABF660C62693E63B07F06B438.jpg)

Hoping not to screw up these instructions... XD

Meanwhile, my friend's Apple Pencil came in:

![58.jpg](/3F02B8E6A11ACD9685480AC1A3A1B011.jpg)

Packaged up and ready to be shipped:

![57.jpg](/4C9EB4114674DC7616D4288D985BE9B4.jpg)

![happy-kitteh.png](/79A440C94997A616EB7FFAE29B35D315.png)

![several-days-later.png](/F784F1203B11CE6966EE50D9064D75FF.png)

![fedex.png](/68C7EF1837B1CE197CC45139F1D53563.png)

![doge.png](/A7FDE7D7B987FEB1155CE77C79406047.png)

![60.jpg](/D5B6B611A1F1B7E31502623C17250D13.jpg)

![61.jpg](/D250C28B0F0E637C65A63EFEC03EF61D.jpg)

![62.jpg](/5C2E0F172063A48132C5E62B6F479294.jpg)

![63.jpg](/BD7AAC6F7D800FD809198DE68826441C.jpg)

![64.jpg](/F13E78B760FDF4C7CA20FE39483BBE12.jpg)

![65.jpg](/F1F9B3A91080C49D781C55F6D0BE25D7.jpg)

![66.jpg](/FB630F32FE5FFE8E7392F2871E37E97C.jpg)

Bonus backlit keyboard at night:

![67.jpg](/0D613CCAE40CA76DD461296B8726BB79.jpg)

---
Copyright &copy; wheelsandbytes 2015-2017. All Rights Reserved
