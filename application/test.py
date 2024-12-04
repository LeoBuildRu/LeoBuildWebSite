#from django.shortcuts import render
#from django.http import JsonResponse
#from .models import *
#from django.views.decorators.csrf import csrf_exempt
#from django.db.models import Q
#from django.contrib.auth import logout
#import uuid
#import json
#
## Create your views here.
#
#cart_total = 0
#
#def index_page(request):
#    return render(request, 'index.html')
#
#def builder_page(request):
#    logout(request)  # стандартная функция выхода
#    request.session.flush()  # очищаем сессию
#    return render(request, 'builder.html')
#
#def get_classes(request):
#
#    category_name = request.GET.get('category')
#    company_name = request.GET.get('company')
#
#    category = Furniture_Categorie.objects.get(furniture_name__iexact=category_name)
#    company = Company_Furniture.objects.get(company_name__iexact=company_name)
#
#    products = Model_Class.objects.filter(
#    product_categories=category,
#    product_company=company,
#    ).values(
#        'unique_id', 'product_name', 'product_icon', 'product_url', 
#        'product_price', 'product_material', 'product_height', 
#        'product_width', 'product_depth', 'product_short_description', 
#        'product_description', 'created_date', 'product_type', 'product_subtype', 'product_material_url',
#        'product_3Durl', 'product_3Dname',
#    )
#
#    return JsonResponse(products, safe=False)
#
#def get_products(request):
#
#    category_name = request.GET.get('category')
#    company_name = request.GET.get('company')
#    model_class_name = request.GET.get('company')
#
#    category = Furniture_Categorie.objects.get(furniture_name__iexact=category_name)
#    company = Company_Furniture.objects.get(company_name__iexact=company_name)
#    model_class = Company_Furniture.objects.get(model_name__iexact=model_class_name)
#
#    products = Product_Item.objects.filter(
#    product_categories=category,
#    product_company=company,
#    product_class=model_class
#    ).values(
#        'unique_id', 'product_name', 'product_icon', 'product_url', 
#        'product_price', 'product_material', 'product_height', 
#        'product_width', 'product_depth', 'product_short_description', 
#        'product_description', 'created_date', 'product_type', 'product_subtype', 'product_material_url',
#        'product_3Durl', 'product_3Dname',
#    )
#
#    post_products = []
#    for product in products:
#        product_item = Product_Item.objects.get(unique_id=product['unique_id'])
#        images = [img.image.url for img in product_item.images.all()]  # Получаем URL изображений
#        product['product_images'] = images
#        post_products.append(product)
#
#    return JsonResponse(post_products, safe=False)
#
#def add_to_cart(request):
#    if request.method == 'POST':
#        item_id = request.POST.get('item_id')
#        # Здесь вы можете использовать сессию или другую логику для хранения корзины
#        cart = request.session.get('cart', {})
#        # Увеличиваем количество товара в корзине или добавляем новый
#        if item_id in cart:
#            cart[item_id]['quantity'] += 1
#        else:
#            item = Product_Item.objects.get(unique_id=item_id)
#            if item.product_type == "material":
#                cart[item_id] = {
#                    'title': item.product_name,
#                    'icon': item.product_icon.url,
#                    'price': 0,  # Устанавливаем цену как "-"
#                    'quantity': 0,  # Устанавливаем количество как "-"
#                    'total': 0  # Общая сумма будет 0
#                }
#            else:
#                cart[item_id] = {
#                    'title': item.product_name,
#                    'icon': item.product_icon.url,
#                    'price': str(item.product_price),
#                    'quantity': 1
#                }
#                
#        request.session['cart'] = cart
#
#        total_amount = 0  # Переменная для хранения общей суммы
#        # Проходим по каждому элементу в корзине и вычисляем сумму
#        for item_id, item_data in cart.items():
#            item_price = float(item_data['price'])  # Преобразуем цену в float
#            item_quantity = item_data['quantity']
#            item_total = item_price * item_quantity  # Считаем итоговую сумму для данного товара
#            item_data['total'] = item_total  # Добавляем итоговую сумму в данные элемента
#            total_amount += item_total  # Добавляем к общей сумме
#
#        product_item = Product_Item.objects.get(unique_id=item_id)
#
#        product_item_data = {
#            'item_type': product_item.product_type,
#            'mesh_subtype': product_item.product_subtype,
#            'model_url': str(product_item.product_3Durl),
#            'model_name': str(product_item.product_3Dname),
#            'width': product_item.product_width,
#            'height': product_item.product_height,
#            'depth': product_item.product_depth,
#            'material_url': product_item.product_material_url.url if product_item.product_material_url else None,
#        }
#
#        context = {
#            'cart': cart,
#            'product': product_item_data,  # Добавляем общую сумму в контекст
#        }
#
#        return JsonResponse(context)
#    
#def cart_view(request):
#    cart = request.session.get('cart', {})
#    total_amount = 0  # Переменная для хранения общей суммы
#
#    # Проходим по каждому элементу в корзине и вычисляем сумму
#    for item_id, item_data in cart.items():
#        item_price = float(item_data['price'])  # Преобразуем цену в float
#        item_quantity = item_data['quantity']
#        item_total = item_price * item_quantity  # Считаем итоговую сумму для данного товара
#        item_data['total'] = item_total  # Добавляем итоговую сумму в данные элемента
#        total_amount += item_total  # Добавляем к общей сумме
#
#    context = {
#        'cart': cart,
#        'total_amount': total_amount,  # Добавляем общую сумму в контекст
#    }
#    return render(request, 'cart.html', context)
#
#def get_item_info(request):
#    item_id = request.GET.get('item_id')
#    item = Product_Item.objects.get(unique_id=item_id)
#    product_images = [img.image.url for img in item.images.all()]  # Получаем URL изображений
#
#    context = {
#        'title': item.product_name,
#        'images': product_images,
#        'info': item.product_description,
#        'price': str(item.product_price),
#        'material': str(item.product_material),
#        'height': str(item.product_height),
#        'width': str(item.product_width),
#        'depth': str(item.product_depth),
#        'url': str(item.product_url),
#        'company': str(item.product_company),
#    }
#    return JsonResponse(context)  # или любой другой атрибут
#
#def get_cart_info(request):
#    cart = request.session.get('cart', {})
#    total_amount = 0  # Переменная для хранения общей суммы
#
#    # Проходим по каждому элементу в корзине и вычисляем сумму
#    for item_id, item_data in cart.items():
#        item_price = float(item_data['price'])  # Преобразуем цену в float
#        item_quantity = item_data['quantity']
#        item_total = item_price * item_quantity  # Считаем итоговую сумму для данного товара
#        item_data['total'] = item_total  # Добавляем итоговую сумму в данные элемента
#        total_amount += item_total  # Добавляем к общей сумме
#
#
#    context = {
#        'cart': cart,
#        'total_amount': total_amount,  # Добавляем общую сумму в контекст
#    }
#    return JsonResponse(context)  # или любой другой атрибут
#
#def get_company(request):
#    category_name = request.GET.get('category')
#    companies_data = []
#
#    if category_name:
#        try:
#            category = Furniture_Categorie.objects.get(furniture_name__iexact=category_name)
#            companies = category.furniture_companies.all()
#            for company in companies:
#                companies_data.append({
#                    'company_name': company.company_name,
#                    'logo_url': company.company_logo.url,  # предполагается, что это правильный путь к изображению
#                })
#        except Furniture_Categorie.DoesNotExist:
#            return JsonResponse({'error': 'Категория не найдена'}, status=404)
#
#    return JsonResponse(companies_data, safe=False)  # возвращаем данные в формате JSON
#
#def search_product(request):
#    if 'term' in request.GET:
#        query = request.GET.get('term')
#        products = Product_Item.objects.filter(Q(product_searchTag__icontains=query))
#        results = []
#        for product in products:
#            results.append({
#                'id': product.unique_id,
#                'name': product.product_name,
#                'description': product.product_short_description,
#                'price': product.product_price,
#                'icon_url': product.product_icon.url if product.product_icon else None,
#            })
#        return JsonResponse(results, safe=False)
#    return JsonResponse([], safe=False)
#
#@csrf_exempt
#def save_scene(request):
#    if request.method == 'POST':
#        # Получаем данные сцены в формате JSON из запроса
#        scene_data = json.loads(request.body)
#        
#        if scene_data:
#            # Сохраняем сериализованную сцену в сессию
#            request.session['scene_data'] = scene_data
#            return JsonResponse({'status': 'success'})
#        
#        return JsonResponse({'status': 'error', 'message': 'No scene data provided.'})
#
#def my_json_view(request):
#    return JsonResponse(request.session['scene_data'], safe=False)



#from django.urls import path
#from . import views
#
#urlpatterns = [
#    path('', views.index_page),
#    path('builder/', views.builder_page),
#    path('add_to_cart/', views.add_to_cart, name='add_to_cart'),
#    path('cart/', views.cart_view, name='cart_view'),
#    path('api/compiledJsonClasses/', views.get_classes, name='get_classes'),
#    path('api/compiledJsonProducts/', views.get_products, name='get_products'),
#    path('get-item-info/', views.get_item_info, name='get_item_info'),
#    path('get-cart-info/', views.get_cart_info, name='get_cart_info'),
#    path('get_company/', views.get_company, name='get_company'),
#    path('search/', views.search_product, name='search_product'),
#    path('save_scene/', views.save_scene, name='save_scene'),
#    path('scene.babylon', views.my_json_view, name='my_json'),
#]