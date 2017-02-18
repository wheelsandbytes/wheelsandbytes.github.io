function AppController($scope, $http) {

    $scope.selectedArticle = "";

    $http.get('../articles.json').success(function(data) {
        $scope.articles = data;
    });

    $scope.getArticleTitle = function(item) {
        $scope.selectedArticle = item;
        return item.title;
    };

    $scope.getArticleLink = function(item) {
        $scope.selectedArticle = item;
        return item.page;
    };

    $scope.getArticlePath = function(item) {
        $scope.selectedArticle = item;
        return item.path;
    };

    $scope.getArticleThumbnail = function(item) {
        $scope.selectedArticle = item;
        return item.thumbnail;
    };

    $scope.getArticleType = function(item) {
        $scope.selectedArticle = item;
        return item.type;
    };

    $scope.getArticleDescription = function(item) {
        $scope.selectedArticle = item;
        return item.description;
    };
}
