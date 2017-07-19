$(document).ready(function(){
    $('.materialboxed').materialbox();
    $(".dropdown-button").dropdown();
    $('.parallax').parallax();
    $(".button-collapse").sideNav();
    $('.slider').slider();
    $('.button-collapse').sideNav({
      menuWidth: 300, // Default is 300
      edge: 'left', // Choose the horizontal origin
      closeOnClick: true, // Closes side-nav on <a> clicks, useful for Angular/Meteor
      draggable: true // Choose whether you can drag to open on touch screens
    }
  );
});
