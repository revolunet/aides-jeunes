'use strict';

angular.module('acceptanceTests').controller('IndexCtrl', function($scope, $http) {
    $http.get('/api/acceptance-tests').then(function(result) {
        $scope.tests = result.data;
    });

    $scope.pendingTests = 0;

    $scope.displayDroitValue = function(value) {
        if (typeof value === 'boolean') {
            return !!value ? 'Oui' : 'Non';
        }

        if (!value) {
            return '';
        }

        return '' + value + ' €';
    };

    $scope.launchSingle = function(test) {
        test.droits.forEach(function(droit) {
            delete droit.status;
            delete droit.actualValue;
        });

        var promise = $http.get('/api/situations/' + test.situation + '/simulation');
        promise.then(function(result) {
            var droits = result.data;
            test.droits.forEach(function(droit) {
                var actualValue = droits[droit.name];
                if (angular.isDefined(actualValue)) {
                    delete droits[droit.name];
                    droit.actualValue = actualValue;
                    if (droit.actualValue === droit.expectedValue) {
                        droit.status = 'ok';
                    } else {
                        droit.status = 'ko';
                    }
                }
            });
            _.forEach(droits, function(value, name) {
                if (value) {
                    test.droits.push({name: name, expectedValue: undefined, actualValue: value, status: 'unknown'});
                }
            });
            _.where(test.droits, {status: undefined}).forEach(function(droit) {
                droit.status = 'ko';
                droit.actualValue = false;
            });
        }, function() {
            test.droits.forEach(function(droit) {
                droit.status = 'ko';
            });
        });

        return promise;
    };

    $scope.launchAll = function() {
        $scope.pendingTests = $scope.tests.length;
        $scope.tests.forEach(function(test) {
            $scope.launchSingle(test).finally(function() {
                $scope.pendingTests--;
            });
        });
    };
});
